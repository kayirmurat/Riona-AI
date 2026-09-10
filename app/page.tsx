"use client";

import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import { modules } from "./components/modules/registry";

const ACTIVE_ID_KEY = "riona_active_conversation_id";

export default function Home() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  }

  return (
    <main className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar
        activeId={activeId}
        onSelect={handleSelect}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col md:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-border bg-surface md:border-r">
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

          {activeId ? (
            <ChatPanel conversationId={activeId} />
          ) : (
            <p className="p-4 text-sm text-ink-muted">Yükleniyor…</p>
          )}
        </section>

        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-border bg-surface-muted p-4 md:w-80 md:border-t-0">
          {modules.map((mod) => (
            <div key={mod.id}>
              <h2 className="mb-2 text-sm font-semibold text-ink">{mod.title}</h2>
              <mod.component />
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
