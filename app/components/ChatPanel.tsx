"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "../../lib/ai/types";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";

interface ChatPanelProps {
  conversationId: string;
}

export default function ChatPanel({ conversationId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [correctedIndices, setCorrectedIndices] = useState<Set<number>>(new Set());
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  async function loadHistory(id: string) {
    try {
      const res = await fetch(`/api/history?conversationId=${id}`);
      const data = await res.json();
      if (data.history) setMessages(data.history);
    } catch (e) {
      console.error("Geçmiş yüklenemedi:", e);
    } finally {
      setHistoryLoaded(true);
    }
  }

  useEffect(() => {
    setHistoryLoaded(false);
    setMessages([]);
    loadHistory(conversationId);
  }, [conversationId]);

  // Realtime tetiklemesinde mesajlar temizlenmeden sessizce yeniden yüklenir —
  // aksi halde her yeni mesajda sohbet bir an boşalıp yeniden dolar.
  useRealtimeRefresh("messages", () => loadHistory(conversationId), {
    column: "conversation_id",
    value: conversationId,
  });

  async function submitCorrection(index: number, wrongText: string) {
    if (!correctionText.trim() || submittingCorrection) return;
    setSubmittingCorrection(true);
    try {
      await fetch("/api/messages/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrongText, correction: correctionText, conversationId }),
      });
      setCorrectedIndices((prev) => new Set(prev).add(index));
      setCorrectingIndex(null);
      setCorrectionText("");
    } catch (e) {
      console.error("Düzeltme kaydedilemedi:", e);
    } finally {
      setSubmittingCorrection(false);
    }
  }

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
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-white" : "bg-surface-sunken text-ink"
              }`}
            >
              {m.content}
            </div>
            {m.role === "assistant" && (
              <div className="mt-1 max-w-[80%]">
                {correctedIndices.has(i) ? (
                  <p className="text-xs text-emerald-600">Not alındı, teşekkürler.</p>
                ) : correctingIndex === i ? (
                  <div className="flex flex-col gap-1">
                    <textarea
                      value={correctionText}
                      onChange={(ev) => setCorrectionText(ev.target.value)}
                      placeholder="Doğrusu neydi?"
                      rows={2}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitCorrection(i, m.content)}
                        disabled={submittingCorrection || !correctionText.trim()}
                        className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Kaydet
                      </button>
                      <button
                        onClick={() => {
                          setCorrectingIndex(null);
                          setCorrectionText("");
                        }}
                        className="rounded-md border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setCorrectingIndex(i);
                      setCorrectionText("");
                    }}
                    className="text-xs text-ink-muted hover:text-ink hover:underline"
                  >
                    Bunu düzelt
                  </button>
                )}
              </div>
            )}
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
