"use client";

import { useEffect, useState } from "react";

interface Account {
  email: string;
  label: string;
}

interface MemoryFact {
  id: string;
  content: string;
  created_at: string;
}

interface PendingAction {
  id: string;
  tool_name: string;
  description: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsModule() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    try {
      const [accountsRes, factsRes, pendingRes] = await Promise.all([
        fetch("/api/settings/accounts"),
        fetch("/api/settings/facts"),
        fetch("/api/pending-actions"),
      ]);
      const accountsData = await accountsRes.json();
      const factsData = await factsRes.json();
      const pendingData = await pendingRes.json();
      setAccounts(accountsData.accounts ?? []);
      setFacts(factsData.facts ?? []);
      setPendingActions(pendingData.actions ?? []);
    } catch (e) {
      console.error("Ayarlar yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  }

  async function respondToPendingAction(id: string, action: "approve" | "reject") {
    setPendingActions((prev) => prev.filter((p) => p.id !== id));
    await fetch("/api/pending-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function removeFact(id: string) {
    setFacts((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/settings/facts?id=${id}`, { method: "DELETE" });
  }

  if (loading) return <p className="text-sm text-ink-muted">Yükleniyor…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Bağlı Google Hesapları</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-ink-muted">Bağlı hesap yok.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.email} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-ink">{a.label}</p>
                <p className="text-xs text-ink-muted">{a.email}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Bekleyen İşlemler ({pendingActions.length})</h3>
        <p className="mb-2 text-xs text-ink-muted">
          Sohbette Riona'ya istediğin ama onay gerektiren işlemler (mail onayları hâlâ Mail panelinden yönetiliyor —
          burası sadece sohbet üzerinden tetiklenen diğer işlemler için).
        </p>
        {pendingActions.length === 0 ? (
          <p className="text-sm text-ink-muted">Bekleyen işlem yok.</p>
        ) : (
          <div className="space-y-2">
            {pendingActions.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="mb-2 text-ink">{p.description}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondToPendingAction(p.id, "approve")}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => respondToPendingAction(p.id, "reject")}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Hatırlanan Bilgiler ({facts.length})</h3>
        <p className="mb-2 text-xs text-ink-muted">
          Riona'nın "remember_fact" veya sohbetteki "Bunu düzelt" ile kaydettiği, her sohbette hatırladığı bilgiler.
        </p>
        {facts.length === 0 ? (
          <p className="text-sm text-ink-muted">Henüz hatırlanan bir bilgi yok.</p>
        ) : (
          <div className="space-y-2">
            {facts.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                <div>
                  <p className="text-ink">{f.content}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatDate(f.created_at)}</p>
                </div>
                <button
                  onClick={() => removeFact(f.id)}
                  className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-muted hover:bg-surface-sunken"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
