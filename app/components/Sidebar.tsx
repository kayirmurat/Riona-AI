"use client";

import { useEffect, useState } from "react";
import NotificationToggle from "./NotificationToggle";
import { Logo } from "./Logo";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { modules } from "./modules/registry";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

interface SidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  view: string;
  onSelectView: (id: string) => void;
}

export default function Sidebar({ activeId, onSelect, isOpen, onClose, view, onSelectView }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingMailCount, setPendingMailCount] = useState(0);
  const [newMeetingsCount, setNewMeetingsCount] = useState(0);

  async function loadConversations() {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (e) {
      console.error("Oturumlar yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingMailCount() {
    try {
      const res = await fetch("/api/scanned-emails/pending-count");
      const data = await res.json();
      setPendingMailCount(typeof data.count === "number" ? data.count : 0);
    } catch (e) {
      console.error("Bekleyen mail sayısı alınamadı:", e);
    }
  }

  // "Yeni" toplantı sayısı sunucuda değil, bu cihazda (localStorage) tutulan
  // son görülme zamanına göre hesaplanıyor — kullanıcı Toplantılar sekmesine
  // her girdiğinde bu zaman damgası güncellenip rozet sıfırlanıyor.
  async function loadNewMeetingsCount() {
    try {
      let lastSeen = localStorage.getItem("meetingsLastSeenAt");
      if (!lastSeen) {
        lastSeen = new Date().toISOString();
        localStorage.setItem("meetingsLastSeenAt", lastSeen);
      }
      const res = await fetch(`/api/meetings/new-count?since=${encodeURIComponent(lastSeen)}`);
      const data = await res.json();
      setNewMeetingsCount(typeof data.count === "number" ? data.count : 0);
    } catch (e) {
      console.error("Yeni toplantı sayısı alınamadı:", e);
    }
  }

  useEffect(() => {
    loadConversations();
    loadPendingMailCount();
    loadNewMeetingsCount();
  }, []);

  useRealtimeRefresh("conversations", loadConversations);
  useRealtimeRefresh("scanned_emails", loadPendingMailCount);
  useRealtimeRefresh("meetings", loadNewMeetingsCount);

  async function handleCreate() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json();
    if (data.conversation?.id) {
      await loadConversations();
      onSelect(data.conversation.id);
      onClose();
    }
  }

  function startRename(conv: Conversation) {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }

  async function commitRename(id: string) {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await loadConversations();
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu oturumu silmek istediğine emin misin?")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    const remaining = conversations.filter((c) => c.id !== id);
    await loadConversations();
    if (activeId === id) {
      if (remaining.length > 0) {
        onSelect(remaining[0].id);
      } else {
        handleCreate();
      }
    }
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-border bg-surface-muted transition-transform md:static md:z-auto md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <h1 className="text-sm font-semibold text-ink">Riona AI</h1>
          </div>
          <button
            className="rounded-md p-1 text-ink-muted hover:bg-surface-sunken md:hidden"
            onClick={onClose}
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={handleCreate}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Yeni sohbet
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && <p className="px-2 py-2 text-xs text-ink-muted">Yükleniyor…</p>}
          {!loading && conversations.length === 0 && (
            <p className="px-2 py-2 text-xs text-ink-muted">Henüz oturum yok.</p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group mb-1 flex items-center gap-1 rounded-lg px-2 py-2 text-sm ${
                view === "chat" && conv.id === activeId
                  ? "bg-surface-sunken text-ink"
                  : "text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              {editingId === conv.id ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => commitRename(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(conv.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded border border-border bg-surface px-1 py-0.5 text-sm text-ink"
                />
              ) : (
                <button
                  onClick={() => {
                    onSelect(conv.id);
                    onClose();
                  }}
                  className="flex-1 truncate text-left"
                  title={conv.title}
                >
                  {conv.title}
                  <span className="block text-xs text-ink-muted">{formatRelativeTime(conv.updated_at)}</span>
                </button>
              )}

              {editingId !== conv.id && (
                <div className="hidden shrink-0 gap-1 group-hover:flex">
                  <button
                    onClick={() => startRename(conv)}
                    className="rounded p-1 text-xs hover:bg-surface"
                    aria-label="Yeniden adlandır"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(conv.id)}
                    className="rounded p-1 text-xs hover:bg-surface"
                    aria-label="Sil"
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-border px-2 py-2">
          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => {
                onSelectView(mod.id);
                if (mod.id === "meetings") {
                  localStorage.setItem("meetingsLastSeenAt", new Date().toISOString());
                  setNewMeetingsCount(0);
                }
              }}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm ${
                view === mod.id ? "bg-surface-sunken text-ink" : "text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              <span>{mod.title}</span>
              {mod.id === "mail" && pendingMailCount > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-medium text-white">
                  {pendingMailCount}
                </span>
              )}
              {mod.id === "meetings" && newMeetingsCount > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-medium text-white">
                  {newMeetingsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="border-t border-border p-3">
          <NotificationToggle />
        </div>
      </aside>
    </>
  );
}
