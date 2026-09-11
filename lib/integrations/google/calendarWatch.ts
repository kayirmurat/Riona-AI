import crypto from "crypto";
import { supabase } from "../../db/supabase";
import { fetchInitialSyncToken } from "./calendar";

export async function registerCalendarWatch(
  email: string,
  label: string,
  accessToken: string
): Promise<{ ok: boolean; message: string }> {
  const pathSecret = process.env.CALENDAR_WEBHOOK_PATH_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL;
  const missing = [
    !pathSecret && "CALENDAR_WEBHOOK_PATH_SECRET",
    !appBaseUrl && "APP_BASE_URL",
  ].filter(Boolean);
  if (missing.length > 0) {
    return { ok: false, message: `Eksik env değişkeni: ${missing.join(", ")}` };
  }

  // Kayıt birden fazla kez tetiklenirse (elle tekrar açma, günlük yenileme cron'u)
  // önceki kanal Google tarafında kapatılmadan yeni bir tane açılırsa, eski kanal
  // "yetim" kalıp bize hâlâ bildirim göndermeye devam ediyor — biz veritabanında
  // sadece en son kanal_id'yi tuttuğumuz için o bildirimler "bilinmeyen kanal"
  // olarak reddediliyor (canlı testte gözlemlendi). Yeni kanal açmadan önce
  // varsa eskisini stop() ile düzgünce kapatıyoruz.
  const { data: existing } = await supabase
    .from("calendar_watch_state")
    .select("channel_id, resource_id")
    .eq("email", email)
    .maybeSingle();

  if (existing?.channel_id && existing?.resource_id) {
    await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: existing.channel_id, resourceId: existing.resource_id }),
    }).catch(() => {
      // Kanal zaten süresi dolmuş/geçersizse stop() hata dönebilir — yeni kanalı
      // açmayı engellemesin, en kötü ihtimalle eski kanal kendi süresi dolunca kapanır.
    });
  }

  const channelId = crypto.randomUUID();
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/watch", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address: `${appBaseUrl}/api/webhooks/calendar/${pathSecret}`,
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    return { ok: false, message: data?.error?.message ?? "Calendar watch kaydı başarısız." };
  }

  const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : null;
  const syncToken = await fetchInitialSyncToken(email);

  await supabase.from("calendar_watch_state").upsert({
    email,
    account_label: label,
    channel_id: channelId,
    resource_id: data.resourceId ?? null,
    sync_token: syncToken,
    channel_expiration: expiration,
    updated_at: new Date().toISOString(),
  });

  return { ok: true, message: `Calendar watch kaydedildi (expiration=${expiration})` };
}

export async function getStoredSyncToken(email: string): Promise<string | null> {
  const { data } = await supabase.from("calendar_watch_state").select("sync_token").eq("email", email).maybeSingle();
  return data?.sync_token ?? null;
}

// history_id'deki (Gmail) aynı prensip: sadece ileri doğru günceller, webhook ile
// watch yenileme cron'u yarışırsa biri diğerinin yazdığı daha yeni değeri eski bir
// değerle ezmesin diye. Sync token'lar sıralı sayı değil opak string olduğu için
// "ileri" karşılaştırması yapılamıyor — burada sadece boş/aynı değilse üzerine yazılır.
export async function advanceSyncToken(email: string, newSyncToken: string): Promise<void> {
  await supabase
    .from("calendar_watch_state")
    .update({ sync_token: newSyncToken, updated_at: new Date().toISOString() })
    .eq("email", email);
}
