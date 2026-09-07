"use client";

import { useState } from "react";
import type { ChatMessage } from "../lib/ai/types";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: messages }),
      });
      const data = await res.json();
      const replyText = res.ok ? data.reply : `Hata: ${data.error}`;
      setMessages([...newHistory, { role: "assistant", content: replyText }]);
    } catch (e) {
      setMessages([...newHistory, { role: "assistant", content: "Bağlantı hatası oluştu." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Riona AI</h1>
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
        {messages.length === 0 && (
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
