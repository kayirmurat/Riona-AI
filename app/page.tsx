"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "../lib/ai/types";

interface PendingAction {
  id: string;
  tool_name: string;
  description: string;
  arguments: Record<string, any>;
}

function getOrCreateConversationId(): string {
  const key = "riona_conversation_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function Home() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);

  async function loadPendingActions() {
    try {
      const res = await fetch("/api/pending-actions");
      const data = await res.json();
      setPendingActions(data.actions ?? []);
    } catch (e) {
      // sessiz geç
    }
  }

  useEffect(() => {
    const id = getOrCreateConversationId();
    setConversationId(id);

    fetch(`/api/history?conversationId=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.history) setMessages(data.history);
      })
      .finally(() => setHistoryLoaded(true));

    loadPendingActions();
  }, []);

  async function respondToPending(id: string, action: "approve" | "reject") {
    await fetch("/api/pending-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    loadPendingActions();
  }

  async function sendMessage() {
    if (!input.trim() || loading || !conversationId) return;
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
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Riona AI</h1>

      {pendingActions.length > 0 && (
        <div
          style={{
            border: "1px solid #f0b429",
            background: "#fffbea",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Bekleyen Onaylar ({pendingActions.length})</h2>
          {pendingActions.map((pa) => (
            <div
              key={pa.id}
              style={{ borderTop: "1px solid #f0b429", paddingTop: 8, marginTop: 8, fontSize: 14 }}
            >
              <p style={{ marginBottom: 8 }}>{pa.description}</p>
              <button
                onClick={() => respondToPending(pa.id, "approve")}
                style={{ marginRight: 8, padding: "6px 12px", borderRadius: 6, border: "none", background: "#0b6", color: "white" }}
              >
                Onayla
              </button>
              <button
                onClick={() => respondToPending(pa.id, "reject")}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #999", background: "white" }}
              >
                Reddet
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          minHeight: 300,
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {!historyLoaded && <p style={{ color: "#888" }}>Geçmiş yükleniyor...</p>}
        {historyLoaded && messages.length === 0 && (
          <p style={{ color: "#888" }}>Bir mesaj yazarak Riona AI ile konuşmaya başla.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? "#0b6" : "#eee",
              color: m.role === "user" ? "white" : "black",
              padding: "8px 12px",
              borderRadius: 12,
              maxWidth: "80%",
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && <div style={{ color: "#888" }}>Riona yazıyor...</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Mesajını yaz..."
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#0b6", color: "white" }}
        >
          Gönder
        </button>
      </div>
    </main>
  );
}
