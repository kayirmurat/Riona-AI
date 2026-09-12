"use client";

import { useEffect, useState } from "react";

interface CalendarEventItem {
  id: string;
  account_label: string;
  title: string | null;
  start: string | null;
  end: string | null;
  location: string | null;
  html_link: string | null;
  hangout_link: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Tarih yok";
  // Tüm gün etkinlikleri (sadece "date", saat yok) "YYYY-MM-DD" formatında gelir.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(iso).toLocaleDateString("tr-TR", { dateStyle: "medium" });
  }
  return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

export default function CalendarModule() {
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    try {
      const res = await fetch("/api/calendar/events");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch (e) {
      console.error("Takvim etkinlikleri yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <div>
      {loading && <p className="text-sm text-ink-muted">Yükleniyor…</p>}
      {!loading && events.length === 0 && (
        <p className="text-sm text-ink-muted">Yaklaşan 30 gün içinde etkinlik bulunamadı.</p>
      )}

      <div className="space-y-3">
        {events.map((e) => (
          <div key={`${e.account_label}:${e.id}`} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-medium text-ink">{e.title || "(başlıksız etkinlik)"}</p>
            <p className="mb-1 text-xs text-ink-muted">
              {formatDate(e.start)} · {e.account_label}
              {e.location && ` · ${e.location}`}
            </p>

            <div className="flex flex-wrap gap-2">
              {e.html_link && (
                <a
                  href={e.html_link}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                >
                  Takvimde Aç
                </a>
              )}
              {e.hangout_link && (
                <a
                  href={e.hangout_link}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                >
                  Meet Linkini Aç
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
