import webpush from "web-push";
import { supabase } from "../db/supabase";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? ""
  );
  configured = true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export type NotificationType = "mail" | "digest" | "health";

const COLUMN_FOR_TYPE: Record<NotificationType, string> = {
  mail: "notify_mail",
  digest: "notify_digest",
  health: "notify_health",
};

// Kayıtlı push subscription'lara bildirim gönderir — `type` verilen
// bildirim türünü kapatmış olan aboneler filtrelenir. İlgili sütun henüz
// eklenmemişse (migration çalıştırılmadan önce) filtre uygulanmadan
// herkese gönderilir — bildirim hiç gitmemesindense yine de gitmesi
// tercih ediliyor. Artık geçersiz (410 Gone) abonelikler temizlenir.
export async function sendPushToAll(payload: PushPayload, type: NotificationType): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  ensureConfigured();

  const column = COLUMN_FOR_TYPE[type];
  const filtered = await supabase.from("push_subscriptions").select("*").eq(column, true);
  const subscriptions = filtered.error ? (await supabase.from("push_subscriptions").select("*")).data : filtered.data;
  if (!subscriptions || subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("[push] bildirim gönderilemedi:", err?.message ?? err);
        }
      }
    })
  );
}
