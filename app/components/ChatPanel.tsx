"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../lib/ai/types";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { useVoiceChat } from "../hooks/useVoiceChat";

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
  const bottomRef = useRef<HTMLDivElement>(null);

  // Her yeni mesajda veya "yazıyor..." göstergesinde otomatik en alta kaydırır
  // — kullanıcı elle kaydırmadan sohbeti takip edebilsin diye.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  async function sendMessageText(text: string): Promise<string> {
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    let replyText: string;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = await res.json();
      replyText = res.ok ? data.reply : `Hata: ${data.error}`;
    } catch (e) {
      replyText = "Bağlantı hatası oluştu.";
    } finally {
      setLoading(false);
    }

    setMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
    return replyText;
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input;
    setInput("");
    await sendMessageText(text);
  }

  const voice = useVoiceChat({
    onTranscript: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
    onVoiceMessage: (text) => sendMessageText(text),
  });

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
        <div ref={bottomRef} />
      </div>

      {voice.voiceMode && (
        <p className="border-t border-border bg-surface-sunken px-3 py-1.5 text-center text-xs text-ink-muted">
          {voice.speaking ? "🔊 Riona konuşuyor…" : voice.listening ? "🎙️ Dinliyorum…" : "Sesli sohbet açık"}
        </p>
      )}

      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Mesajını yaz…"
          disabled={voice.voiceMode}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
        />
        {voice.supported && (
          <>
            <button
              onClick={voice.dictate}
              disabled={voice.listening || voice.voiceMode}
              title="Konuşarak yaz"
              className={`rounded-lg border px-3 py-2 text-sm transition disabled:opacity-50 ${
                voice.listening && !voice.voiceMode
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-ink hover:bg-surface-sunken"
              }`}
            >
              🎤
            </button>
            <button
              onClick={voice.toggleVoiceMode}
              title="Sesli sohbet"
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                voice.voiceMode
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-ink hover:bg-surface-sunken"
              }`}
            >
              🗣️
            </button>
          </>
        )}
        <button
          onClick={sendMessage}
          disabled={loading || voice.voiceMode}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Gönder
        </button>
      </div>
    </div>
  );
}
