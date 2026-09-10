import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db/supabase";
import { getValidAccessTokenFor } from "../../../../../lib/integrations/google/tokens";
import { fetchHistorySince, getStoredHistoryId, advanceHistoryId, registerWatch } from "../../../../../lib/integrations/google/watch";
import { classifyAndStoreEmail } from "../../../../../lib/ai/mailProcessing";

const FALLBACK_MAX_MESSAGES = 10;

// Pub/Sub push aboneliği watch() kaydı sırasında geçen URL'e istek atar.
// Path'teki secret sadece ek bir engel (defense-in-depth) — asıl doğruluk,
// payload'daki historyId'ye güvenmeyip her zaman kendi sakladığımız
// history_id'den Gmail'in history.list'ini yeniden çekmekten geliyor.
async function fallbackFullScan(email: string, label: string, accessToken: string) {
  const query = encodeURIComponent("in:inbox category:primary");
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${FALLBACK_MAX_MESSAGES}&q=${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    console.error(`[webhook/gmail] fallback messages.list hatası: email=${email} status=${listRes.status}`);
    return;
  }
  const listData = await listRes.json();
  const messages: { id: string }[] = listData.messages ?? [];
  for (const m of messages) {
    await classifyAndStoreEmail({ email, label }, m.id, accessToken);
  }
  // history_id'yi yeniden çapala ki bir sonraki webhook çağrısı tekrar 404 almasın.
  await registerWatch(email, label, accessToken);
}

export async function POST(req: Request, { params }: { params: { secret: string } }) {
  if (params.secret !== process.env.GMAIL_PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz gövde." }, { status: 400 });
  }

  const dataB64 = body?.message?.data;
  if (!dataB64) {
    // Pub/Sub'ın doğrulama/test isteği olabilir — 200 dönmek retry'ı önler.
    return NextResponse.json({ success: true, skipped: "no data" });
  }

  let notification: { emailAddress?: string; historyId?: string | number };
  try {
    notification = JSON.parse(Buffer.from(dataB64, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Payload çözülemedi." }, { status: 400 });
  }

  const email = notification.emailAddress;
  if (!email) {
    return NextResponse.json({ success: true, skipped: "emailAddress yok" });
  }

  const { data: account } = await supabase.from("google_accounts").select("email, label").eq("email", email).maybeSingle();
  if (!account) {
    console.error(`[webhook/gmail] bilinmeyen hesap: ${email}`);
    return NextResponse.json({ success: true, skipped: "hesap tanınmadı" });
  }

  const accessToken = await getValidAccessTokenFor(account.email);
  if (!accessToken) {
    console.error(`[webhook/gmail] token alınamadı: ${email}`);
    return NextResponse.json({ success: false, error: "Token alınamadı." }, { status: 500 });
  }

  const storedHistoryId = await getStoredHistoryId(account.email);
  if (!storedHistoryId) {
    // Watch hiç kayıtlı değilse (beklenmedik durum) tam taramaya düş ve çapala.
    await fallbackFullScan(account.email, account.label, accessToken);
    return NextResponse.json({ success: true, mode: "fallback_no_history" });
  }

  const history = await fetchHistorySince(account.email, accessToken, storedHistoryId);

  if (!history.ok) {
    await fallbackFullScan(account.email, account.label, accessToken);
    return NextResponse.json({ success: true, mode: `fallback_${history.reason}` });
  }

  let processed = 0;
  for (const messageId of history.messageIds) {
    const result = await classifyAndStoreEmail({ email: account.email, label: account.label }, messageId, accessToken);
    if (result === "inserted") processed++;
  }

  await advanceHistoryId(account.email, history.newHistoryId);

  return NextResponse.json({ success: true, mode: "incremental", found: history.messageIds.length, processed });
}
