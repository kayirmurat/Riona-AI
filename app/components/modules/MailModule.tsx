"use client";

import { useEffect, useState } from "react";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";

interface EmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

interface ScannedEmail {
  id: string;
  account_label: string;
  from_address: string;
  subject: string;
  snippet: string;
  body_text: string | null;
  cc: string | null;
  attachments: EmailAttachment[] | null;
  needs_reply: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  pending_action_id: string | null;
  status: string;
  category: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Tab = "pending" | "info" | "history";

const STATUS_LABELS: Record<string, string> = {
  executed: "Gönderildi",
  rejected: "Reddedildi",
  archived: "Arşivlendi",
  trashed: "Silindi",
};

const TERMINAL_STATUSES = new Set(["executed", "rejected", "archived", "trashed"]);

export default function MailModule() {
  const [scannedEmails, setScannedEmails] = useState<ScannedEmail[]>([]);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; cc: string; bcc: string }>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<ScannedEmail[]>([]);
  const [searching, setSearching] = useState(false);
  const [generatingDraftFor, setGeneratingDraftFor] = useState<Record<string, boolean>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [refineInstructions, setRefineInstructions] = useState<Record<string, string>>({});
  const [refiningFor, setRefiningFor] = useState<Record<string, boolean>>({});

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
      const initialEdits: Record<string, { subject: string; body: string; cc: string; bcc: string }> = {};
      emails.forEach((e) => {
        if (e.needs_reply && e.status === "pending") {
          initialEdits[e.id] = {
            subject: e.draft_subject ?? "",
            body: e.draft_body ?? "",
            cc: e.cc ?? "",
            bcc: "",
          };
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

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/scanned-emails?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      const results: ScannedEmail[] = data.emails ?? [];
      setSearchResults(results);
      setSearchActive(true);
      const newEdits: Record<string, { subject: string; body: string; cc: string; bcc: string }> = {};
      results.forEach((e) => {
        if (e.needs_reply && e.status === "pending") {
          newEdits[e.id] = {
            subject: e.draft_subject ?? "",
            body: e.draft_body ?? "",
            cc: e.cc ?? "",
            bcc: "",
          };
        }
      });
      setEdits((prev) => ({ ...newEdits, ...prev }));
    } catch (e) {
      console.error("Mail araması başarısız:", e);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchActive(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  function refreshAfterAction() {
    if (searchActive) {
      runSearch(searchQuery);
    } else {
      loadScannedEmails();
    }
  }

  async function generateDraft(id: string) {
    setGeneratingDraftFor((prev) => ({ ...prev, [id]: true }));
    setDraftErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/scanned-emails/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDraftErrors((prev) => ({ ...prev, [id]: data.error ?? "Taslak oluşturulamadı." }));
        return;
      }
      // Mail artık needs_reply=true + status=pending oldu — kullanıcı hâlâ
      // "Bilgi Amaçlı" sekmesindeyse taslak orada görünmez, "kayboldu" gibi
      // hissettirir. Arama modunda değilse doğrudan Onay Bekleyen'e geçiyoruz.
      if (!searchActive) setTab("pending");
      refreshAfterAction();
    } catch (e) {
      console.error("Taslak oluşturulamadı:", e);
      setDraftErrors((prev) => ({ ...prev, [id]: "Bağlantı hatası oluştu." }));
    } finally {
      setGeneratingDraftFor((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function applyRefineInstruction(id: string) {
    const instruction = refineInstructions[id]?.trim();
    const current = edits[id];
    if (!instruction || !current) return;
    setRefiningFor((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/scanned-emails/refine-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: current.subject, body: current.body, instruction }),
      });
      const data = await res.json();
      if (res.ok) {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], subject: data.subject, body: data.body } }));
        setRefineInstructions((prev) => ({ ...prev, [id]: "" }));
      } else {
        console.error("Taslak düzenlenemedi:", data.error);
      }
    } catch (e) {
      console.error("Taslak düzenlenemedi:", e);
    } finally {
      setRefiningFor((prev) => ({ ...prev, [id]: false }));
    }
  }

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
            ? {
                subject: editedValues.subject,
                body: editedValues.body,
                cc: editedValues.cc || null,
                bcc: editedValues.bcc || null,
              }
            : undefined,
      }),
    });
    refreshAfterAction();
  }

  async function handleQuickAction(id: string, action: "archive" | "trash" | "mark_read") {
    await fetch("/api/scanned-emails/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    refreshAfterAction();
  }

  const activeEmails = scannedEmails.filter((e) => !TERMINAL_STATUSES.has(e.status));
  const pendingEmails = activeEmails.filter((e) => e.needs_reply);
  const infoEmails = activeEmails.filter((e) => !e.needs_reply);
  const historyEmails = scannedEmails.filter((e) => TERMINAL_STATUSES.has(e.status));
  const categories = Array.from(new Set(scannedEmails.map((e) => e.category).filter((c): c is string => !!c))).sort();
  const tabEmails = tab === "pending" ? pendingEmails : tab === "info" ? infoEmails : historyEmails;
  const filteredTabEmails = selectedCategory ? tabEmails.filter((e) => e.category === selectedCategory) : tabEmails;
  const visibleEmails = searchActive ? searchResults : filteredTabEmails;

  return (
    <div>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          runSearch(searchQuery);
        }}
        className="mb-3 flex gap-2"
      >
        <input
          value={searchQuery}
          onChange={(ev) => setSearchQuery(ev.target.value)}
          placeholder="Tüm mail geçmişinde ara (konu, gönderen, içerik)..."
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          {searching ? "Aranıyor..." : "Ara"}
        </button>
        {searchActive && (
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
          >
            Temizle
          </button>
        )}
      </form>

      {searchActive && (
        <p className="mb-3 text-xs text-ink-muted">
          "{searchQuery}" için {searchResults.length} sonuç (tüm geçmiş, sadece son 48 saat/onay bekleyenlerle sınırlı değil).
        </p>
      )}

      <div
        className={`mb-3 flex gap-1 rounded-lg bg-surface-sunken p-1 text-xs font-medium ${
          searchActive ? "pointer-events-none opacity-40" : ""
        }`}
      >
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

      {!searchActive && categories.length > 0 && (
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
          {searchActive
            ? "Aramanla eşleşen mail bulunamadı."
            : tab === "pending"
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

            {e.attachments && e.attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {e.attachments.map((a) => (
                  <a
                    key={a.attachmentId}
                    href={`/api/scanned-emails/attachments?emailId=${e.id}&attachmentId=${a.attachmentId}`}
                    className="rounded-md border border-border bg-surface-sunken px-2 py-1 text-xs text-ink hover:bg-surface"
                  >
                    📎 {a.filename} ({formatFileSize(a.size)})
                  </a>
                ))}
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
                  placeholder="Konu"
                />
                <input
                  value={edits[e.id]?.cc ?? ""}
                  onChange={(ev) =>
                    setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], cc: ev.target.value } }))
                  }
                  className="mb-1 w-full rounded border border-border px-2 py-1 text-sm"
                  placeholder="Cc (opsiyonel)"
                />
                <input
                  value={edits[e.id]?.bcc ?? ""}
                  onChange={(ev) =>
                    setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], bcc: ev.target.value } }))
                  }
                  className="mb-1 w-full rounded border border-border px-2 py-1 text-sm"
                  placeholder="Bcc (opsiyonel)"
                />
                <textarea
                  value={edits[e.id]?.body ?? ""}
                  onChange={(ev) =>
                    setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], body: ev.target.value } }))
                  }
                  rows={4}
                  className="mb-2 w-full rounded border border-border px-2 py-1 text-sm"
                />
                <div className="mb-2 flex gap-2">
                  <input
                    value={refineInstructions[e.id] ?? ""}
                    onChange={(ev) => setRefineInstructions((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                    onKeyDown={(ev) => ev.key === "Enter" && applyRefineInstruction(e.id)}
                    placeholder="Riona'ya talimat ver (örn. İngilizceye çevir, daha resmi yap)"
                    className="flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                  />
                  <button
                    onClick={() => applyRefineInstruction(e.id)}
                    disabled={refiningFor[e.id] || !refineInstructions[e.id]?.trim()}
                    className="shrink-0 rounded-md border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {refiningFor[e.id] ? "Düzenleniyor…" : "Riona'ya Sor"}
                  </button>
                </div>
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
              <div className="rounded-md border border-border bg-surface-sunken p-2">
                <p className="mb-2 text-xs text-ink-muted">
                  Yanıt gerektirmiyor olarak sınıflandırıldı, ama istersen bir cevap taslağı hazırlanabilir.
                </p>
                <button
                  onClick={() => generateDraft(e.id)}
                  disabled={generatingDraftFor[e.id]}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                >
                  {generatingDraftFor[e.id] ? "Taslak hazırlanıyor…" : "Cevap Taslağı Hazırla"}
                </button>
                {draftErrors[e.id] && <p className="mt-1 text-xs text-red-600">{draftErrors[e.id]}</p>}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
              <button
                onClick={() => handleQuickAction(e.id, "mark_read")}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken"
              >
                Okundu İşaretle
              </button>
              <button
                onClick={() => handleQuickAction(e.id, "archive")}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken"
              >
                Arşivle
              </button>
              <button
                onClick={() => handleQuickAction(e.id, "trash")}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken"
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
