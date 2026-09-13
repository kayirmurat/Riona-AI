import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export interface NotificationPrefs {
  notify_mail: boolean;
  notify_digest: boolean;
  notify_health: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { notify_mail: true, notify_digest: true, notify_health: true };

export type NotificationStatus = "unsupported" | "denied" | "off" | "on" | "loading";

// Bildirim aboneliği durumu ve tercihleri — hem sidebar'daki kompakt
// NotificationToggle hem de Ayarlar sekmesindeki ayrıntılı bölüm aynı hook'u
// kullanıyor, aksi halde iki ayrı yerde bağımsız abonelik yönetimi durumun
// birbirinden sapmasına yol açabilirdi.
export function useNotificationSubscription() {
  const [status, setStatus] = useState<NotificationStatus>("loading");
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  const loadPrefs = useCallback(async (endpoint: string) => {
    try {
      const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`);
      if (res.ok) setPrefs(await res.json());
    } catch {
      // Yüklenemezse varsayılan (hepsi açık) ile devam edilir.
    }
  }, []);

  const check = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await loadPrefs(sub.endpoint);
        setStatus("on");
      } else {
        setStatus("off");
      }
    } catch {
      setStatus("off");
    }
  }, [loadPrefs]);

  useEffect(() => {
    check();
  }, [check]);

  async function updatePref(key: keyof NotificationPrefs, value: boolean) {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, [key]: value }),
      });
    } catch {
      // Sessizce yok sayılıyor — bir sonraki yüklemede eski değer görünür.
    }
  }

  async function enable() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY tanımlı değil.");
      return;
    }
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setPrefs(DEFAULT_PREFS);
      setStatus("on");
    } catch (e) {
      console.error("Bildirim aboneliği başarısız:", e);
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch (e) {
      console.error("Bildirim aboneliği kapatılamadı:", e);
    } finally {
      setStatus("off");
    }
  }

  return { status, prefs, enable, disable, updatePref };
}
