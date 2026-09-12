"use client";

import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import { modules } from "./components/modules/registry";

const ACTIVE_ID_KEY = "riona_active_conversation_id";

export default function Home() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState("chat");

  useEffect(() => {
    async function init() {
      const stored = localStorage.getItem(ACTIVE_ID_KEY);
      if (stored) {
        setActiveId(stored);
        return;
      }
      // Eski sürümden kalma tek konuşma id'si varsa onu kullan (kaybolmasın).
      const legacy = localStorage.getItem("riona_conversation_id");
      if (legacy) {
        localStorage.setItem(ACTIVE_ID_KEY, legacy);
        setActiveId(legacy);
        return;
      }
      const res = await fetch("/api/conversations", { method: "POST" });
      const data = await res.json();
      if (data.conversation?.id) {
        localStorage.setItem(ACTIVE_ID_KEY, data.conversation.id);
        setActiveId(data.conversation.id);
      }
    }
    init();
  }, []);

  function handleSelect(id: string) {
    localStorage.setItem(ACTIVE_ID_KEY, id);
    setActiveId(id);
    setView("chat");
  }

  function handleSelectView(id: string) {
    setView(id);
    setSidebarOpen(false);
  }

  const activeModule = modules.find((mod) => mod.id === view);

  return (
    <main className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar
        activeId={activeId}
        onSelect={handleSelect}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        view={view}
        onSelectView={handleSelectView}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-ink-muted hover:bg-surface-sunken"
            aria-label="Menü"
          >
            ☰
          </button>
          <span className="text-sm font-medium text-ink">Riona AI</span>
        </div>

        {view === "chat" ? (
          activeId ? (
            <ChatPanel conversationId={activeId} />
          ) : (
            <p className="p-4 text-sm text-ink-muted">Yükleniyor…</p>
          )
        ) : activeModule ? (
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">{activeModule.title}</h2>
            <activeModule.component />
          </div>
        ) : null}
      </section>
    </main>
  );
}
