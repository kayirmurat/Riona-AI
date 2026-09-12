"use client";

import { useEffect, useState } from "react";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";

interface EmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

interface ComposedAttachment {
  filename: string;
  mimeType: string;
  dataBase64: string;
  size: number;
}

interface DraftEdit {
  subject: string;
  body: string;
  cc: string;
  bcc: string;
  attachments: ComposedAttachment[];
}

const MAX_ATTACHMENTS_TOTAL_BYTES = 3 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});

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
      const initialEdits: Record<string, DraftEdit> = {};
      emails.forEach((e) => {
        if (e.needs_reply && e.status === "pending") {
          initialEdits[e.id] = {
            subject: e.draft_subject ?? "",
            body: e.draft_body ?? "",
            cc: e.cc ?? "",
            bcc: "",
            attachments: [],
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
      const newEdits: Record<string, DraftEdit> = {};
      results.forEach((e) => {
        if (e.needs_reply && e.status === "pending") {
          newEdits[e.id] = {
            subject: e.draft_subject ?? "",
            body: e.draft_body ?? "",
            cc: e.cc ?? "",
            bcc: "",
            attachments: [],
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
    const res = await fetch("/api/pending-actions", {
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
                attachments: editedValues.attachments.map(({ filename, mimeType, dataBase64 }) => ({
                  filename,
                  mimeType,
                  dataBase64,
                })),
              }
            : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAttachmentErrors((prev) => ({ ...prev, [emailId]: data.error ?? "İşlem başarısız." }));
      return;
    }
    refreshAfterAction();
  }

  async function handleQuickAction(id: string, action: "archive" | "trash" | "mark_read" | "mark_unread") {
    await fetch("/api/scanned-emails/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    refreshAfterAction();
  }

  async function bulkAction(action: "archive" | "trash" | "mark_read" | "mark_unread") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await fetch("/api/scanned-emails/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    setSelectedIds(new Set());
    refreshAfterAction();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFileSelect(id: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachmentErrors((prev) => ({ ...prev, [id]: "" }));
    const current = edits[id]?.attachments ?? [];
    let totalBytes = current.reduce((sum, a) => sum + a.size, 0);
    const newAttachments: ComposedAttachment[] = [];

    for (const file of Array.from(files)) {
      if (totalBytes + file.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        setAttachmentErrors((prev) => ({
          ...prev,
          [id]: `Toplam ek boyutu sınırını (3MB) aşıyor, "${file.name}" eklenmedi.`,
        }));
        continue;
      }
      const dataBase64 = await fileToBase64(file);
      newAttachments.push({ filename: file.name, mimeType: file.type || "application/octet-stream", dataBase64, size: file.size });
      totalBytes += file.size;
    }

    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], attachments: [...(prev[id]?.attachments ?? []), ...newAttachments] },
    }));
  }

  function removeAttachment(id: string, index: number) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], attachments: (prev[id]?.attachments ?? []).filter((_, i) => i !== index) },
    }));
  }

  async function renameCategory(oldCategory: string) {
    const newCategory = window.prompt(`"${oldCategory}" kategorisini yeniden adlandır:`, oldCategory);
    if (!newCategory || !newCategory.trim() || newCategory.trim() === oldCategory) return;
    await fetch("/api/scanned-emails/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldCategory, newCategory: newCategory.trim() }),
    });
    if (selectedCategory === oldCategory) setSelectedCategory(newCategory.trim());
    refreshAfterAction();
  }

  async function deleteCategory(oldCategory: string) {
    if (!confirm(`"${oldCategory}" kategorisini kaldırmak istediğine emin misin? Bu kategorideki mailler kategorisiz kalacak.`)) return;
    await fetch("/api/scanned-emails/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldCategory, newCategory: null }),
    });
    if (selectedCategory === oldCategory) setSelectedCategory(null);
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
            <div key={cat} className="flex items-center gap-0.5">
              <button
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full border px-2 py-0.5 text-xs transition ${
                  selectedCategory === cat
                    ? "border-accent bg-accent text-white"
                    : "border-border text-ink-muted hover:bg-surface-sunken"
                }`}
              >
                {cat}
              </button>
              <button
                onClick={() => renameCategory(cat)}
                title="Yeniden adlandır"
                className="text-xs text-ink-muted hover:text-ink"
              >
                ✎
              </button>
              <button
                onClick={() => deleteCategory(cat)}
                title="Kategoriyi kaldır"
                className="text-xs text-ink-muted hover:text-red-600"
              >
                ×
              </button>
            </div>
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

      {visibleEmails.length > 0 && (
        <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={visibleEmails.every((e) => selectedIds.has(e.id))}
            onChange={(ev) => {
              if (ev.target.checked) {
                setSelectedIds((prev) => new Set([...prev, ...visibleEmails.map((e) => e.id)]));
              } else {
                const visibleIdSet = new Set(visibleEmails.map((e) => e.id));
                setSelectedIds((prev) => new Set([...prev].filter((id) => !visibleIdSet.has(id))));
              }
            }}
          />
          <span>Tümünü seç</span>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent/5 p-2 text-xs">
          <span className="font-medium text-ink">{selectedIds.size} seçili</span>
          <button
            onClick={() => bulkAction("mark_read")}
            className="rounded-md border border-border bg-surface px-2 py-1 text-ink-muted hover:bg-surface-sunken"
          >
            Okundu İşaretle
          </button>
          <button
            onClick={() => bulkAction("mark_unread")}
            className="rounded-md border border-border bg-surface px-2 py-1 text-ink-muted hover:bg-surface-sunken"
          >
            Okunmadı İşaretle
          </button>
          <button
            onClick={() => bulkAction("archive")}
            className="rounded-md border border-border bg-surface px-2 py-1 text-ink-muted hover:bg-surface-sunken"
          >
            Arşivle
          </button>
          <button
            onClick={() => bulkAction("trash")}
            className="rounded-md border border-border bg-surface px-2 py-1 text-ink-muted hover:bg-surface-sunken"
          >
            Sil
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-md border border-border bg-surface px-2 py-1 text-ink-muted hover:bg-surface-sunken"
          >
            Temizle
          </button>
        </div>
      )}

      <div className="space-y-3">
        {visibleEmails.map((e) => (
          <div key={e.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => toggleSelect(e.id)}
                  className="mt-1 shrink-0"
                />
                <p className="font-medium text-ink">{e.subject || "(konu yok)"}</p>
              </div>
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
                <input
                  type="file"
                  multiple
                  onChange={(ev) => handleFileSelect(e.id, ev.target.files)}
                  className="mb-1 w-full text-xs"
                />
                {(edits[e.id]?.attachments?.length ?? 0) > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {edits[e.id].attachments.map((a, idx) => (
                      <span key={idx} className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
                        {a.filename} ({formatFileSize(a.size)})
                        <button onClick={() => removeAttachment(e.id, idx)} className="ml-1 text-red-600">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {attachmentErrors[e.id] && <p className="mb-1 text-xs text-red-600">{attachmentErrors[e.id]}</p>}
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
                onClick={() => handleQuickAction(e.id, "mark_unread")}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken"
              >
                Okunmadı İşaretle
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
