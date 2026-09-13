"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

interface NotificationPrefs {
  notify_mail: boolean;
  notify_digest: boolean;
  notify_health: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { notify_mail: true, notify_digest: true, notify_health: true };

const PREF_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "notify_mail", label: "Cevap bekleyen mail uyarıları" },
  { key: "notify_digest", label: "Günlük mail özeti" },
  { key: "notify_health", label: "Mail/takvim izleme uyarıları" },
];

export default function NotificationToggle() {
  const [status, setStatus] = useState<"unsupported" | "denied" | "off" | "on" | "loading">("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

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
        if (sub) {
          setEndpoint(sub.endpoint);
          loadPrefs(sub.endpoint);
          setStatus("on");
        } else {
          setStatus("off");
        }
      } catch {
        setStatus("off");
      }
    }
    check();
  }, []);

  async function loadPrefs(ep: string) {
    try {
      const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(ep)}`);
      if (res.ok) setPrefs(await res.json());
    } catch {
      // Yüklenemezse varsayılan (hepsi açık) ile devam edilir.
    }
  }

  async function updatePref(key: keyof NotificationPrefs, value: boolean) {
    if (!endpoint) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, [key]: value }),
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
      setEndpoint(sub.endpoint);
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
      setEndpoint(null);
      setStatus("off");
    }
  }

  if (status === "unsupported" || status === "loading") return null;

  if (status === "on") {
    return (
      <div className="space-y-2 px-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-ink-muted">🔔 Bildirimler açık</span>
          <button onClick={disable} className="text-ink-muted underline hover:text-ink">
            Kapat
          </button>
        </div>
        <div className="space-y-1">
          {PREF_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-ink-muted">
              <input type="checkbox" checked={prefs[key]} onChange={(e) => updatePref(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </div>
    );
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
