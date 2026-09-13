"use client";

import { useNotificationSubscription, type NotificationPrefs } from "../../hooks/useNotificationSubscription";

const PREF_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "notify_mail", label: "Cevap bekleyen mail uyarıları" },
  { key: "notify_digest", label: "Günlük mail özeti" },
  { key: "notify_health", label: "Mail/takvim izleme uyarıları" },
];

export default function NotificationSettingsSection() {
  const { status, prefs, enable, disable, updatePref } = useNotificationSubscription();

  if (status === "unsupported") return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Bildirimler</h3>

      {status === "denied" && (
        <p className="rounded-lg border border-border bg-surface p-3 text-xs text-ink-muted">
          Bildirimler tarayıcı ayarlarından engellenmiş. Etkinleştirmek için tarayıcı site izinlerinden açman gerekiyor.
        </p>
      )}

      {status === "off" && (
        <button
          onClick={enable}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          🔔 Bildirimleri Etkinleştir
        </button>
      )}

      {status === "loading" && <p className="text-xs text-ink-muted">Yükleniyor…</p>}

      {status === "on" && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">🔔 Bildirimler açık</span>
            <button onClick={disable} className="text-xs text-ink-muted underline hover:text-ink">
              Kapat
            </button>
          </div>
          <div className="space-y-1.5 border-t border-border pt-2">
            {PREF_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-xs text-ink-muted">
                <input type="checkbox" checked={prefs[key]} onChange={(e) => updatePref(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
