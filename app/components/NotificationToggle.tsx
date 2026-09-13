"use client";

import { useNotificationSubscription } from "../hooks/useNotificationSubscription";

interface NotificationToggleProps {
  onOpenSettings: () => void;
}

// Sidebar'daki kompakt gösterim — tür bazlı tercihler ve kapatma butonu
// burada değil, yer kaplamasın diye Ayarlar sekmesinde (dişli ikonuyla oraya
// yönlendiriliyor).
export default function NotificationToggle({ onOpenSettings }: NotificationToggleProps) {
  const { status, enable } = useNotificationSubscription();

  if (status === "unsupported" || status === "loading") return null;

  if (status === "on") {
    return (
      <div className="flex items-center justify-between px-2 text-xs">
        <span className="text-ink-muted">🔔 Bildirimler açık</span>
        <button onClick={onOpenSettings} title="Bildirim ayarları" className="text-ink-muted hover:text-ink">
          ⚙️
        </button>
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
