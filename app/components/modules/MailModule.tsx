"use client";

import { useEffect, useState } from "react";

interface ScannedEmail {
  id: string;
  account_label: string;
  from_address: string;
  subject: string;
  snippet: string;
  needs_reply: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  pending_action_id: string | null;
  status: string;
}

export default function MailModule() {
  const [scannedEmails, setScannedEmails] = useState<ScannedEmail[]>([]);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});

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

  async function respondToPending(pendingActionId: string, action: "approve" | "reject", emailId: string) {
    const editedValues = edits[emailId];
    await fetch("/api/pending-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pendingActionId,
        action,
        overrides:
          action === "approve" && editedValues
            ? { subject: editedValues.subject, body: editedValues.body }
            : undefined,
      }),
    });
    loadScannedEmails();
  }

  const activeEmails = scannedEmails.filter((e) => e.status !== "executed" && e.status !== "rejected");

  if (activeEmails.length === 0) {
    return <p className="text-sm text-ink-muted">Taranan yeni mail yok.</p>;
  }

  return (
    <div className="space-y-3">
      {activeEmails.map((e) => (
        <div key={e.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="font-medium text-ink">{e.subject || "(konu yok)"}</p>
          <p className="mb-1 text-xs text-ink-muted">
            Kimden: {e.from_address} · Hesap: {e.account_label}
          </p>
          <p className="mb-2 text-ink-muted">{e.snippet}</p>

          {e.needs_reply ? (
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
              <div className="flex gap-2">
                <button
                  onClick={() => e.pending_action_id && respondToPending(e.pending_action_id, "approve", e.id)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Onayla
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
  );
}
