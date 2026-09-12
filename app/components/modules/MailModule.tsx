"use client";

import { useEffect, useState } from "react";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";

interface ScannedEmail {
  id: string;
  account_label: string;
  from_address: string;
  subject: string;
  snippet: string;
  body_text: string | null;
  needs_reply: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  pending_action_id: string | null;
  status: string;
  category: string | null;
}

type Tab = "pending" | "info" | "history";

const STATUS_LABELS: Record<string, string> = {
  executed: "Gönderildi",
  rejected: "Reddedildi",
};

export default function MailModule() {
  const [scannedEmails, setScannedEmails] = useState<ScannedEmail[]>([]);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  async function loadScannedEmails() {
    try {
      const res = await fetch("/api/scanned-emails");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      const emails: ScannedEmail[] = data.emails ?? [];
      setScannedEmails(emails);
      const initialEdits: Record<string, { subject: string; body: string }> = {};
      emails.forEach((e) => {
        if (e.needs_reply && e.status === "pending") {
          initialEdits[e.id] = { subject: e.draft_subject ?? "", body: e.draft_body ?? "" };
        }
      });
      setEdits((prev) => ({ ...initialEdits, ...prev }));
    } catch (e) {
      console.error("Taranan mailler yüklenemedi:", e);
    }
  }

  useEffect(() => {
    loadScannedEmails();
  }, []);

  useRealtimeRefresh("scanned_emails", loadScannedEmails);

  async function respondToPending(
    pendingActionId: string,
    action: "approve_draft" | "approve_send" | "reject",
    emailId: string
  ) {
    const editedValues = edits[emailId];
    await fetch("/api/pending-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pendingActionId,
        action,
        overrides:
          action !== "reject" && editedValues
            ? { subject: editedValues.subject, body: editedValues.body }
            : undefined,
      }),
    });
    loadScannedEmails();
  }

  const activeEmails = scannedEmails.filter((e) => e.status !== "executed" && e.status !== "rejected");
  const pendingEmails = activeEmails.filter((e) => e.needs_reply);
  const infoEmails = activeEmails.filter((e) => !e.needs_reply);
  const historyEmails = scannedEmails.filter((e) => e.status === "executed" || e.status === "rejected");
  const categories = Array.from(new Set(scannedEmails.map((e) => e.category).filter((c): c is string => !!c))).sort();
  const tabEmails = tab === "pending" ? pendingEmails : tab === "info" ? infoEmails : historyEmails;
  const visibleEmails = selectedCategory ? tabEmails.filter((e) => e.category === selectedCategory) : tabEmails;

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-lg bg-surface-sunken p-1 text-xs font-medium">
        <button
          onClick={() => setTab("pending")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            tab === "pending" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          Onay Bekleyen ({pendingEmails.length})
        </button>
        <button
          onClick={() => setTab("info")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            tab === "info" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          Bilgi Amaçlı ({infoEmails.length})
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex-1 rounded-md px-2 py-1.5 transition ${
            tab === "history" ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          Geçmiş ({historyEmails.length})
        </button>
      </div>

      {categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full border px-2 py-0.5 text-xs transition ${
              selectedCategory === null
                ? "border-accent bg-accent text-white"
                : "border-border text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            Tümü
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full border px-2 py-0.5 text-xs transition ${
                selectedCategory === cat
                  ? "border-accent bg-accent text-white"
                  : "border-border text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {visibleEmails.length === 0 && (
        <p className="text-sm text-ink-muted">
          {tab === "pending"
            ? "Onay bekleyen mail yok."
            : tab === "info"
              ? "Bilgi amaçlı taranan mail yok."
              : "Geçmişte gönderilmiş/reddedilmiş mail yok."}
        </p>
      )}

      <div className="space-y-3">
        {visibleEmails.map((e) => (
          <div key={e.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink">{e.subject || "(konu yok)"}</p>
              <div className="flex shrink-0 gap-1">
                {STATUS_LABELS[e.status] && (
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
                    {STATUS_LABELS[e.status]}
                  </span>
                )}
                {e.category && (
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
                    {e.category}
                  </span>
                )}
              </div>
            </div>
            <p className="mb-1 text-xs text-ink-muted">
              Kimden: {e.from_address} · Hesap: {e.account_label}
            </p>
            <p className="mb-2 text-ink-muted">{e.snippet}</p>

            {e.body_text && (
              <div className="mb-2">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                >
                  {expanded[e.id] ? "Tam Maili Gizle" : "Tam Maili Gör"}
                </button>
                {expanded[e.id] && (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-sunken p-2 text-xs text-ink">
                    {e.body_text}
                  </pre>
                )}
              </div>
            )}

            {e.status === "executed" || e.status === "rejected" ? (
              e.draft_body && (
                <div className="rounded-md border border-border bg-surface-sunken p-2">
                  <p className="mb-1 text-xs text-ink-muted">
                    {e.status === "executed" ? "Gönderilen/kaydedilen cevap:" : "Reddedilen taslak:"}
                  </p>
                  <p className="text-xs text-ink">{e.draft_body}</p>
                </div>
              )
            ) : e.needs_reply ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
                <p className="mb-1 text-xs text-amber-800">Önerilen cevap (düzenleyebilirsin):</p>
                <input
                  value={edits[e.id]?.subject ?? ""}
                  onChange={(ev) =>
                    setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], subject: ev.target.value } }))
                  }
                  className="mb-1 w-full rounded border border-border px-2 py-1 text-sm"
                />
                <textarea
                  value={edits[e.id]?.body ?? ""}
                  onChange={(ev) =>
                    setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], body: ev.target.value } }))
                  }
                  rows={4}
                  className="mb-2 w-full rounded border border-border px-2 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => e.pending_action_id && respondToPending(e.pending_action_id, "approve_draft", e.id)}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Taslak Olarak Kaydet
                  </button>
                  <button
                    onClick={() => e.pending_action_id && respondToPending(e.pending_action_id, "approve_send", e.id)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Gönder
                  </button>
                  <button
                    onClick={() => e.pending_action_id && respondToPending(e.pending_action_id, "reject", e.id)}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Reddet
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">Yanıt gerektirmiyor.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
