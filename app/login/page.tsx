"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const data = await res.json();
        setError(data.error ?? "Giriş başarısız.");
      }
    } catch (e) {
      setError("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Riona AI — Giriş</h1>
      <input
        type="email"
        placeholder="E-posta"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
      <input
        type="password"
        placeholder="Şifre"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
      {error && <p style={{ color: "red", fontSize: 14 }}>{error}</p>}
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "none", background: "#0b6", color: "white" }}
      >
        {loading ? "Giriş yapılıyor..." : "Giriş yap"}
      </button>
    </main>
  );
}
