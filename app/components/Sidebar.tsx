"use client";

import { useEffect, useState } from "react";

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
}

export default function Sidebar({ activeId, onSelect, isOpen, onClose }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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

  useEffect(() => {
    loadConversations();
  }, []);

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
          <h1 className="text-sm font-semibold text-ink">Riona AI</h1>
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
                conv.id === activeId ? "bg-surface-sunken text-ink" : "text-ink-muted hover:bg-surface-sunken"
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
      </aside>
    </>
  );
}
