import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db/supabase";
import { summarizeMeeting } from "../../../../../lib/ai/meetingSummary";

// Meeting BaaS Stage 2'de gönderilen webhook_url'e POST atıyor. Path'teki secret
// (Gmail webhook'undaki gibi) ek bir engel; asıl doğrulama MEETING_BAAS_WEBHOOK_SECRET
// ile HMAC-SHA256 imza kontrolü. Kullanıcı panelde webhook imzalama secret'ını henüz
// bulamadıysa (MEETING_BAAS_WEBHOOK_SECRET boş), path secret'a güvenip devam ediyoruz —
// aksi halde ilk canlı testte hiç veri kaydedilemez. Secret bulununca env'e eklenmesi
// yeterli, kod değişikliği gerekmiyor.
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const signingSecret = process.env.MEETING_BAAS_WEBHOOK_SECRET;
  if (!signingSecret) {
    console.warn("[webhooks/meeting-baas] MEETING_BAAS_WEBHOOK_SECRET tanımlı değil, imza kontrolü atlanıyor.");
    return true;
  }
  if (!signatureHeader) {
    console.error("[webhooks/meeting-baas] x-meetingbaas-signature header'ı yok.");
    return false;
  }
  const expected = crypto.createHmac("sha256", signingSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signatureHeader, "utf-8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.error(
      `[webhooks/meeting-baas] imza uyuşmadı: beklenen=${expected.slice(0, 12)}... gelen=${signatureHeader.slice(0, 12)}... bodyLen=${rawBody.length}`
    );
    return false;
  }
  return true;
}

export async function POST(req: Request, { params }: { params: { secret: string } }) {
  if (params.secret !== process.env.MEETING_BAAS_WEBHOOK_PATH_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get("x-meetingbaas-signature"))) {
    return NextResponse.json({ error: "İmza doğrulanamadı." }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Geçersiz gövde." }, { status: 400 });
  }

  // Alan adları henüz canlı veriyle teyit edilmedi — ham payload'ı her zaman
  // logluyoruz ki gerçek şekli görüp gerekirse eşlemeyi düzeltelim (Gmail
  // history.list ile yapılan tanı sürecindeki aynı yaklaşım).
  console.log(`[webhooks/meeting-baas] event alındı: ${JSON.stringify(body).slice(0, 2000)}`);

  const eventType: string | undefined = body?.event ?? body?.type;
  const botId: string | undefined = body?.bot_id ?? body?.data?.bot_id ?? body?.bot?.id;

  if (!botId) {
    console.error("[webhooks/meeting-baas] payload'da bot_id bulunamadı, işlenemedi.");
    return NextResponse.json({ success: true, skipped: "bot_id yok" });
  }

  const { data: meeting } = await supabase.from("meetings").select("id").eq("bot_id", botId).maybeSingle();
  if (!meeting) {
    console.error(`[webhooks/meeting-baas] bot_id eşleşmedi: ${botId}`);
    return NextResponse.json({ success: true, skipped: "eşleşen toplantı yok" });
  }

  if (eventType === "failed" || eventType === "bot.failed") {
    await supabase
      .from("meetings")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", meeting.id);
    return NextResponse.json({ success: true, handled: "failed" });
  }

  if (eventType === "complete" || eventType === "transcription_complete") {
    const transcript = body?.transcript ?? body?.data?.transcript ?? null;
    const recordingUrl = body?.mp4 ?? body?.recording_url ?? body?.data?.mp4 ?? null;
    const speakers = body?.speakers ?? body?.data?.speakers ?? null;

    // Transkript boşsa (bot toplantıya giremedi/konuşma yakalanamadı) özetleme
    // atlanır — status 'transcribed' kalır, panelde "özet henüz oluşturulmadı"
    // olarak görünür; boş içerikten uydurma bir özet üretmek yerine bu tercih edildi.
    const summary = await summarizeMeeting(transcript);

    await supabase
      .from("meetings")
      .update({
        transcript,
        recording_url: recordingUrl,
        speakers,
        summary_tr: summary?.summary_tr ?? null,
        summary_en: summary?.summary_en ?? null,
        status: summary ? "completed" : "transcribed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);
    return NextResponse.json({ success: true, handled: summary ? "completed" : "transcribed" });
  }

  // Diğer olay tipleri (örn. bot toplantıya katıldı) — sadece log, no-op.
  return NextResponse.json({ success: true, handled: "ignored", event: eventType ?? null });
}
