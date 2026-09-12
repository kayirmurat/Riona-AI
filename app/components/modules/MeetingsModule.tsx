"use client";

import { useEffect, useState } from "react";
import { formatTranscriptLines } from "../../../lib/meetings/transcriptFormat";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";

interface Meeting {
  id: string;
  title: string | null;
  platform: string;
  calendar_event_link: string | null;
  starts_at: string;
  status: string;
  speakers: unknown;
  transcript: unknown;
  recording_url: string | null;
  summary_tr: string | null;
  summary_en: string | null;
  failure_reason?: string | null;
}

type Tab = "upcoming" | "past";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Bekliyor",
  dispatching: "Bot Gönderiliyor",
  dispatched: "Bot Katıldı",
  transcribed: "Transkript Alındı",
  completed: "Tamamlandı",
  failed: "Başarısız",
};

const PAST_STATUSES = new Set(["transcribed", "completed", "failed"]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function speakersText(speakers: unknown): string | null {
  if (!Array.isArray(speakers) || speakers.length === 0) return null;
  return speakers
    .map((s) => (typeof s === "string" ? s : (s as any)?.name ?? JSON.stringify(s)))
    .join(", ");
}

function transcriptText(transcript: unknown): string {
  if (!transcript) return "Transkript henüz yok.";
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    const lines = formatTranscriptLines(transcript);
    if (lines.length === 0) return "Transkriptte konuşma metni bulunamadı.";
    return lines.map((line) => `${line.speaker}: ${line.text}`).join("\n");
  }
  return JSON.stringify(transcript, null, 2);
}

export default function MeetingsModule() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [summaryLang, setSummaryLang] = useState<Record<string, "tr" | "en">>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [dispatchingFor, setDispatchingFor] = useState<Record<string, boolean>>({});
  const [dispatchErrors, setDispatchErrors] = useState<Record<string, string>>({});

  async function loadMeetings() {
    try {
      const res = await fetch("/api/meetings");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setMeetings(data.meetings ?? []);
    } catch (e) {
      console.error("Toplantılar yüklenemedi:", e);
    }
  }

  useEffect(() => {
    loadMeetings();
  }, []);

  useRealtimeRefresh("meetings", loadMeetings);

  async function dispatchMeeting(id: string) {
    setDispatchingFor((prev) => ({ ...prev, [id]: true }));
    setDispatchErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/meetings/${id}/dispatch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDispatchErrors((prev) => ({ ...prev, [id]: data.error ?? "Bot gönderilemedi." }));
        return;
      }
      loadMeetings();
    } catch (e) {
      console.error("Bot gönderilemedi:", e);
      setDispatchErrors((prev) => ({ ...prev, [id]: "Bağlantı hatası oluştu." }));
    } finally {
      setDispatchingFor((prev) => ({ ...prev, [id]: false }));
    }
  }

  const searched = searchQuery.trim()
    ? meetings.filter((m) => {
        const q = searchQuery.trim().toLowerCase();
        return (m.title ?? "").toLowerCase().includes(q) || (speakersText(m.speakers) ?? "").toLowerCase().includes(q);
      })
    : meetings;
  const upcoming = searched.filter((m) => !PAST_STATUSES.has(m.status));
  const past = searched.filter((m) => PAST_STATUSES.has(m.status));
  const visible = tab === "upcoming" ? upcoming : past;

  return (
    <div>
      <input
        value={searchQuery}
        onChange={(ev) => setSearchQuery(ev.target.value)}
        placeholder="Toplantı başlığı veya konuşmacı ara..."
        className="mb-3 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
      />

      <div className="mb-3 flex gap-1 rounded-lg bg-surface-sunken p-1 text-xs font-medium">
        <button
          onClick={() => setTab("upcoming")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            tab === "upcoming" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          Yaklaşan ({upcoming.length})
        </button>
        <button
          onClick={() => setTab("past")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            tab === "past" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          Geçmiş ({past.length})
        </button>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-ink-muted">
          {tab === "upcoming" ? "Yaklaşan toplantı bulunamadı." : "Geçmiş toplantı bulunamadı."}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((m) => {
          const lang = summaryLang[m.id] ?? "tr";
          const summary = lang === "tr" ? m.summary_tr : m.summary_en;
          const speakers = speakersText(m.speakers);

          return (
            <div key={m.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-ink">{m.title || "(başlıksız toplantı)"}</p>
                <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
                  {STATUS_LABELS[m.status] ?? m.status}
                </span>
              </div>
              <p className="mb-1 text-xs text-ink-muted">
                {formatDate(m.starts_at)} · {m.platform}
                {speakers && ` · ${speakers}`}
              </p>

              {summary ? (
                <div className="mb-2 rounded-md border border-border bg-surface-sunken p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">Özet</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSummaryLang((prev) => ({ ...prev, [m.id]: "tr" }))}
                        className={`rounded px-1.5 py-0.5 text-xs ${lang === "tr" ? "bg-accent text-white" : "text-ink-muted"}`}
                      >
                        TR
                      </button>
                      <button
                        onClick={() => setSummaryLang((prev) => ({ ...prev, [m.id]: "en" }))}
                        className={`rounded px-1.5 py-0.5 text-xs ${lang === "en" ? "bg-accent text-white" : "text-ink-muted"}`}
                      >
                        EN
                      </button>
                    </div>
                  </div>
                  <p className="text-ink">{summary}</p>
                </div>
              ) : (
                PAST_STATUSES.has(m.status) && (
                  <p className="mb-2 text-xs text-ink-muted">Özet henüz oluşturulmadı.</p>
                )
              )}

              {m.status === "failed" && (
                <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2">
                  <p className="mb-1 text-xs text-red-800">
                    Bot gönderilemedi{m.failure_reason ? `: ${m.failure_reason}` : "."}
                  </p>
                  <button
                    onClick={() => dispatchMeeting(m.id)}
                    disabled={dispatchingFor[m.id]}
                    className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    {dispatchingFor[m.id] ? "Deneniyor…" : "Tekrar Dene"}
                  </button>
                  {dispatchErrors[m.id] && <p className="mt-1 text-xs text-red-700">{dispatchErrors[m.id]}</p>}
                </div>
              )}

              {m.status === "scheduled" && (
                <div className="mb-2">
                  <button
                    onClick={() => dispatchMeeting(m.id)}
                    disabled={dispatchingFor[m.id]}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {dispatchingFor[m.id] ? "Gönderiliyor…" : "Botu Şimdi Gönder"}
                  </button>
                  {dispatchErrors[m.id] && <p className="mt-1 text-xs text-red-600">{dispatchErrors[m.id]}</p>}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {m.calendar_event_link && (
                  <a
                    href={m.calendar_event_link}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Takvim Etkinliğini Aç
                  </a>
                )}
                {m.recording_url && (
                  <a
                    href={m.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Kaydı Aç
                  </a>
                )}
                {m.transcript !== null && (
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    {expanded[m.id] ? "Transkripti Gizle" : "Tam Transkripti Gör"}
                  </button>
                )}
              </div>

              {expanded[m.id] && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-sunken p-2 text-xs text-ink">
                  {transcriptText(m.transcript)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
