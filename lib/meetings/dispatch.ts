import { supabase } from "../db/supabase";

const LEAD_WINDOW_MIN = 10;
const CATCH_UP_WINDOW_MIN = 5;
const BOT_NAME = "Riona AI Notetaker";

interface DueMeeting {
  id: string;
  meeting_url: string;
}

async function findDueMeetings(): Promise<DueMeeting[]> {
  const now = Date.now();
  const windowStart = new Date(now - CATCH_UP_WINDOW_MIN * 60 * 1000).toISOString();
  const windowEnd = new Date(now + LEAD_WINDOW_MIN * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("meetings")
    .select("id, meeting_url")
    .eq("status", "scheduled")
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  if (error) {
    console.error(`[meetings/dispatch] adaylar aranırken hata: ${error.message}`);
    return [];
  }
  return data ?? [];
}

// Aynı satırı iki cron tick'inin (veya cron + manuel tetiklemenin) çakışıp iki kez
// dispatch etmesini önler: update sadece status hâlâ 'scheduled' ise satırı etkiler,
// dönen satır boşsa başka biri zaten almış demektir — burada durulur.
async function claimMeeting(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("meetings")
    .update({ status: "dispatching", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("id");

  if (error) {
    console.error(`[meetings/dispatch] claim hatası: meeting=${id} error=${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

async function callMeetingBaas(meetingUrl: string, webhookUrl: string): Promise<{ ok: boolean; botId?: string; message?: string }> {
  const res = await fetch("https://api.meetingbaas.com/bots", {
    method: "POST",
    headers: {
      "x-meeting-baas-api-key": process.env.MEETING_BAAS_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    // Not: bot toplantıya "Riona AI Notetaker" adıyla görünür, isimli bir katılımcı
    // olarak girer — gizli/sessiz bir kayıt değil. Toplantı katılımcılarının bundan
    // önceden haberdar edilmesi gerekebilir (bkz. README'deki gizlilik notu).
    body: JSON.stringify({ meeting_url: meetingUrl, bot_name: BOT_NAME, webhook_url: webhookUrl }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, message: data?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, botId: data?.bot_id ?? data?.id };
}

export async function dispatchDueBots(): Promise<{ dispatched: number; skipped: number; failed: number }> {
  const appBaseUrl = process.env.APP_BASE_URL;
  const pathSecret = process.env.MEETING_BAAS_WEBHOOK_PATH_SECRET;
  if (!appBaseUrl || !pathSecret || !process.env.MEETING_BAAS_API_KEY) {
    console.error("[meetings/dispatch] MEETING_BAAS_API_KEY / MEETING_BAAS_WEBHOOK_PATH_SECRET / APP_BASE_URL eksik, dispatch atlanıyor.");
    return { dispatched: 0, skipped: 0, failed: 0 };
  }
  const webhookUrl = `${appBaseUrl}/api/webhooks/meeting-baas/${pathSecret}`;

  const candidates = await findDueMeetings();
  let dispatched = 0;
  let skipped = 0;
  let failed = 0;

  for (const meeting of candidates) {
    const claimed = await claimMeeting(meeting.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const result = await callMeetingBaas(meeting.meeting_url, webhookUrl);
    if (!result.ok) {
      console.error(`[meetings/dispatch] bot gönderilemedi: meeting=${meeting.id} error=${result.message}`);
      await supabase
        .from("meetings")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", meeting.id);
      failed++;
      continue;
    }

    await supabase
      .from("meetings")
      .update({
        status: "dispatched",
        bot_id: result.botId ?? null,
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);
    dispatched++;
  }

  return { dispatched, skipped, failed };
}
