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
// dispatch etmesini önler: update sadece status verilen listedeyse satırı etkiler,
// dönen satır boşsa başka biri zaten almış demektir — burada durulur.
async function claimMeetingFrom(id: string, fromStatuses: string[]): Promise<boolean> {
  const { data, error } = await supabase
    .from("meetings")
    .update({ status: "dispatching", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", fromStatuses)
    .select("id");

  if (error) {
    console.error(`[meetings/dispatch] claim hatası: meeting=${id} error=${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

// failure_reason kolonu henüz eklenmemişse (kullanıcı SQL'i çalıştırmadıysa) bu
// yazma sessizce hata verir ama status güncellemesini ASLA etkilemesin diye
// ayrı, best-effort bir çağrı olarak yapılıyor — Stage 21'de yaşanan "eksik
// kolon insert'i sessizce bozuyor" sınıfı hatadan ders çıkarıldı.
async function tryWriteFailureReason(id: string, message: string | null): Promise<void> {
  const { error } = await supabase.from("meetings").update({ failure_reason: message }).eq("id", id);
  if (error) {
    console.error(`[meetings/dispatch] failure_reason yazılamadı (kolon eksik olabilir): meeting=${id}`, error);
  }
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
    // recording_mode: "gallery_view" — varsayılan "speaker_view" tek bir aktif
    // kareyi gösteriyor, kullanıcı diğer katılımcıları ve ekran paylaşımlarını
    // da görmek istediği için galeri görünümüne geçildi.
    //
    // speech_to_text gerçek hatası (canlı testte Meeting BaaS'ın ham hata
    // gövdesinden görüldü): "data did not match any variant of untagged enum
    // SpeechToText" — {provider: "gladia"} şekli obje varyantı için gereken
    // api_key alanını içermiyordu. Doğru şekil: düz bir string ("Default"),
    // Meeting BaaS'ın kendi bundled transkripsiyon servisini kullanır, ayrı
    // bir sağlayıcı API anahtarı gerektirmez. bot_image de aslında suçlu
    // değilmiş (kaldırılınca da 422 devam etti) — geri eklendi.
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: BOT_NAME,
      webhook_url: webhookUrl,
      bot_image: `${process.env.APP_BASE_URL}/icon.svg`,
      recording_mode: "gallery_view",
      automatic_leave: { waiting_room_timeout: (LEAD_WINDOW_MIN + 10) * 60, silence_timeout: 120 },
      // "Default" isteği artık kabul ediliyor (422 çözüldü) ama transkript
      // hâlâ boş geliyor — muhtemelen "Default" motoru Türkçe konuşmayı
      // desteklemiyor. Gladia açıkça çok dilli (Türkçe dahil) olduğu için
      // deneniyor.
      speech_to_text: "Gladia",
    }),
  });

  const rawText = await res.text();
  const data = (() => {
    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  })();

  if (!res.ok) {
    // Meeting BaaS'ın gerçek hata gövdesini logla — sadece "HTTP 422" bilgisi
    // hangi alanın reddedildiğini anlamaya yetmiyor (bot_image/recording_mode/
    // speech_to_text gibi yeni eklenen alanlardan biri olabilir).
    console.error(`[meetings/dispatch] Meeting BaaS hata gövdesi: status=${res.status} body=${rawText.slice(0, 1000)}`);
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
    const claimed = await claimMeetingFrom(meeting.id, ["scheduled"]);
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
      await tryWriteFailureReason(meeting.id, result.message ?? null);
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

// Kullanıcının Toplantılar panelinden tek bir toplantıya elle bot göndermesi
// için — otomatik algılama LEAD_WINDOW_MIN penceresini kaçırmış olabilir veya
// kullanıcı daha erken göndermek isteyebilir. "failed" durumundaki bir
// toplantı için de "Tekrar Dene" olarak kullanılıyor.
export async function dispatchSingleMeeting(meetingId: string): Promise<{ ok: boolean; message: string }> {
  const appBaseUrl = process.env.APP_BASE_URL;
  const pathSecret = process.env.MEETING_BAAS_WEBHOOK_PATH_SECRET;
  if (!appBaseUrl || !pathSecret || !process.env.MEETING_BAAS_API_KEY) {
    return { ok: false, message: "Meeting BaaS yapılandırması eksik." };
  }
  const webhookUrl = `${appBaseUrl}/api/webhooks/meeting-baas/${pathSecret}`;

  const { data: meeting } = await supabase.from("meetings").select("id, meeting_url").eq("id", meetingId).maybeSingle();
  if (!meeting) return { ok: false, message: "Toplantı bulunamadı." };

  const claimed = await claimMeetingFrom(meetingId, ["scheduled", "failed"]);
  if (!claimed) return { ok: false, message: "Toplantı şu anda gönderilemez durumda (zaten gönderilmiş veya işleniyor olabilir)." };

  const result = await callMeetingBaas(meeting.meeting_url, webhookUrl);
  if (!result.ok) {
    await supabase.from("meetings").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", meetingId);
    await tryWriteFailureReason(meetingId, result.message ?? null);
    return { ok: false, message: result.message ?? "Bot gönderilemedi." };
  }

  await supabase
    .from("meetings")
    .update({
      status: "dispatched",
      bot_id: result.botId ?? null,
      dispatched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", meetingId);
  return { ok: true, message: "Bot gönderildi." };
}
