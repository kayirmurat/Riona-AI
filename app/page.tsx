"use client";

import { useEffect, useState } from "react";
import type { ChatMessage } from "../lib/ai/types";

interface ScannedEmail {
  id: string;
  account_label: string;
  from_address: string;
  subject: string;
  snippet: string;
  needs_reply: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  pending_action_id: string | null;
  status: string;
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
  const [scannedEmails, setScannedEmails] = useState<ScannedEmail[]>([]);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});

  async function loadScannedEmails() {
    try {
      const res = await fetch("/api/scanned-emails");
      const data = await res.json();
      const emails: ScannedEmail[] = data.emails ?? [];
      setScannedEmails(emails);
      const initialEdits: Record<string, { subject: string; body: string }> = {};
      emails.forEach((e) => {
        if (e.needs_reply && e.status === "pending") {
          initialEdits[e.id] = { subject: e.draft_subject ?? "", body: e.draft_body ?? "" };
        }
      });
      setEdits((prev) => ({ ...initialEdits, ...prev }));
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

    loadScannedEmails();
  }, []);

  async function respondToPending(pendingActionId: string, action: "approve" | "reject", emailId: string) {
    const editedValues = edits[emailId];
    await fetch("/api/pending-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pendingActionId,
        action,
        overrides:
          action === "approve" && editedValues
            ? { subject: editedValues.subject, body: editedValues.body }
            : undefined,
      }),
    });
    loadScannedEmails();
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

  const activeEmails = scannedEmails.filter((e) => e.status !== "executed" && e.status !== "rejected");

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Riona AI</h1>

      {activeEmails.length > 0 && (
        <div
          style={{
            border: "1px solid #ccc",
            background: "#f9fafb",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Taranan Mailler ({activeEmails.length})</h2>
          {activeEmails.map((e) => (
            <div
              key={e.id}
              style={{
                borderTop: "1px solid #ddd",
                paddingTop: 10,
                marginTop: 10,
                fontSize: 14,
              }}
            >
              <p style={{ fontWeight: 600 }}>{e.subject || "(konu yok)"}</p>
              <p style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>
                Kimden: {e.from_address} · Hesap: {e.account_label}
              </p>
              <p style={{ color: "#444", marginBottom: 8 }}>{e.snippet}</p>

              {e.needs_reply ? (
                <div style={{ background: "#fffbea", border: "1px solid #f0b429", borderRadius: 6, padding: 8 }}>
                  <p style={{ fontSize: 12, color: "#92400e", marginBottom: 4 }}>Önerilen cevap (düzenleyebilirsin):</p>
                  <input
                    value={edits[e.id]?.subject ?? ""}
                    onChange={(ev) =>
                      setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], subject: ev.target.value } }))
                    }
                    style={{ width: "100%", padding: 6, marginBottom: 6, borderRadius: 4, border: "1px solid #ccc" }}
                  />
                  <textarea
                    value={edits[e.id]?.body ?? ""}
                    onChange={(ev) =>
                      setEdits((prev) => ({ ...prev, [e.id]: { ...prev[e.id], body: ev.target.value } }))
                    }
                    rows={4}
                    style={{ width: "100%", padding: 6, marginBottom: 6, borderRadius: 4, border: "1px solid #ccc" }}
                  />
                  <button
                    onClick={() => e.pending_action_id && respondToPending(e.pending_action_id, "approve", e.id)}
                    style={{ marginRight: 8, padding: "6px 12px", borderRadius: 6, border: "none", background: "#0b6", color: "white" }}
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => e.pending_action_id && respondToPending(e.pending_action_id, "reject", e.id)}
                    style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #999", background: "white" }}
                  >
                    Reddet
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "#888" }}>Yanıt gerektirmiyor.</p>
              )}
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
