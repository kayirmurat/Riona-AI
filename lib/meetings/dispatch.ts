import { supabase } from "../db/supabase";

const LEAD_WINDOW_MIN = 30;
const CATCH_UP_WINDOW_MIN = 20;
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
    //
    // waiting_room_timeout: bot LEAD_WINDOW_MIN kadar erken gönderiliyor ve hemen
    // katılmaya çalışıyor; Meeting BaaS'ın varsayılan bekleme süresi (600sn/10dk)
    // bizim gönderme penceremizden kısa olduğu için toplantı henüz başlamadan bot
    // zaman aşımına uğrayıp ayrılıyordu (canlı testte "call_ended" + boş transkript
    // olarak gözlemlendi). Bekleme süresini gönderme penceresi + pay kadar açıkça
    // uzatıyoruz ki bot gerçek toplantı başlayana kadar beklesin.
    // speech_to_text: canlı testte konuşma olmasına rağmen transkript hep boş
    // geliyordu — Meeting BaaS transkripsiyonu varsayılan olarak açmıyor, bu
    // alan açıkça gönderilmezse ses kaydedilse bile hiç transkript çıkmıyor.
    //
    // silence_timeout: varsayılanı 10 dakika — toplantı bitip herkes sessiz
    // kalınca bot hemen ayrılmıyor, 10 dakika daha kayıt/bekleme yapıyordu
    // (canlı testte bot 30sn'de kabul edildiği halde ~10dk'lık kayıt oluştu).
    // 2 dakikaya çekiyoruz ki konuşma bitince bot makul bir sürede ayrılsın.
    //
    // bot_image: varsayılan avatar sadece "R" harfi gösteriyordu, kullanıcı
    // Riona AI logosunu istedi. recording_mode: "gallery_view" — varsayılan
    // "speaker_view" tek bir aktif kareyi gösteriyor, kullanıcı diğer
    // katılımcıları ve ekran paylaşımlarını da görmek istediği için galeri
    // görünümüne geçildi.
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: BOT_NAME,
      webhook_url: webhookUrl,
      bot_image: `${process.env.APP_BASE_URL}/icon.svg`,
      recording_mode: "gallery_view",
      automatic_leave: { waiting_room_timeout: (LEAD_WINDOW_MIN + 10) * 60, silence_timeout: 120 },
      speech_to_text: { provider: "gladia" },
    }),
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
