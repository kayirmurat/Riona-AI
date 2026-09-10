"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "../../lib/ai/types";

interface ChatPanelProps {
  conversationId: string;
}

export default function ChatPanel({ conversationId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([]);
    fetch(`/api/history?conversationId=${conversationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.history) setMessages(data.history);
      })
      .catch((e) => console.error("Geçmiş yüklenemedi:", e))
      .finally(() => setHistoryLoaded(true));
  }, [conversationId]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, conversationId }),
      });
      const data = await res.json();
      const replyText = res.ok ? data.reply : `Hata: ${data.error}`;
      setMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Bağlantı hatası oluştu." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!historyLoaded && <p className="text-sm text-ink-muted">Geçmiş yükleniyor…</p>}
        {historyLoaded && messages.length === 0 && (
          <p className="text-sm text-ink-muted">Bir mesaj yazarak Riona AI ile konuşmaya başla.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-white" : "bg-surface-sunken text-ink"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-ink-muted">Riona yazıyor…</p>}
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Mesajını yaz…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Gönder
        </button>
      </div>
    </div>
  );
}
