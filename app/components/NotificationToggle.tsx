"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function NotificationToggle() {
  const [status, setStatus] = useState<"unsupported" | "denied" | "off" | "on" | "loading">("loading");

  useEffect(() => {
    async function check() {
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
        setStatus(sub ? "on" : "off");
      } catch {
        setStatus("off");
      }
    }
    check();
  }, []);

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
      // register() dönüşü henüz "active" olmayabilir (installing/waiting
      // durumunda olabilir) — pushManager.subscribe() bunu ister, bu yüzden
      // service worker gerçekten aktif olana kadar bekleniyor.
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
      setStatus("on");
    } catch (e) {
      console.error("Bildirim aboneliği başarısız:", e);
      setStatus("off");
    }
  }

  if (status === "unsupported" || status === "loading") return null;

  if (status === "on") {
    return <p className="px-2 text-xs text-ink-muted">🔔 Bildirimler açık</p>;
  }

  if (status === "denied") {
    return <p className="px-2 text-xs text-ink-muted">Bildirimler tarayıcı ayarlarından engellenmiş.</p>;
  }

  return (
    <button
      onClick={enable}
      className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-sunken"
    >
      🔔 Bildirimleri Etkinleştir
    </button>
  );
}
