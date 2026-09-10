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

// Kayıtlı tüm push subscription'lara bildirim gönderir. Artık geçersiz
// (410 Gone) olanları veritabanından temizler.
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  ensureConfigured();

  const { data: subscriptions } = await supabase.from("push_subscriptions").select("*");
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
