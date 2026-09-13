"use client";

import { useEffect, useState } from "react";

interface HealthIssue {
  account: string;
  type: string;
  detail: string;
}

interface HealthResult {
  healthy: boolean;
  issues: HealthIssue[];
  checked_at: string;
}

interface StatusResponse {
  lastCheck: HealthResult | null;
  cronRuns: Record<string, string | null>;
}

const CRON_LABELS: Record<string, string> = {
  "daily-digest": "Günlük mail özeti",
  "health-check": "Sağlık kontrolü (otomatik)",
  "daily-conversation": "Günlük sohbet oluşturma",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HealthStatusSection() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justChecked, setJustChecked] = useState(false);

  async function loadStatus() {
    try {
      const res = await fetch("/api/health/status");
      setStatus(await res.json());
    } catch (e) {
      console.error("Sistem durumu yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function checkNow() {
    setChecking(true);
    setJustChecked(false);
    try {
      await fetch("/api/health/check", { method: "POST" });
      await loadStatus();
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 4000);
    } catch (e) {
      console.error("Kontrol başarısız:", e);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Sistem Durumu</h3>
      <p className="mb-2 text-xs text-ink-muted">
        Mail/takvim izleme (watch kaydı süresi) ve toplantı botu dispatch pipeline'ının otomatik kontrolü.
      </p>

      <div className="space-y-3 rounded-lg border border-border bg-surface p-3 text-sm">
        {loading ? (
          <p className="text-xs text-ink-muted">Yükleniyor…</p>
        ) : status?.lastCheck ? (
          <div>
            <p className={status.lastCheck.healthy ? "text-emerald-600" : "text-red-600"}>
              {status.lastCheck.healthy ? "✓ Her şey yolunda" : `⚠ ${status.lastCheck.issues.length} sorun bulundu`}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">Son kontrol: {formatDate(status.lastCheck.checked_at)}</p>
            {!status.lastCheck.healthy && (
              <ul className="mt-2 space-y-1">
                {status.lastCheck.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-ink-muted">
                    <span className="font-medium text-ink">{issue.account}</span>: {issue.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">Henüz hiç kontrol çalışmadı.</p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={checkNow}
            disabled={checking}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
          >
            {checking ? "Kontrol ediliyor…" : "Şimdi Kontrol Et"}
          </button>
          {justChecked && <span className="text-xs text-emerald-600">✓ Kontrol tamamlandı</span>}
        </div>

        {status?.cronRuns && (
          <div className="border-t border-border pt-2">
            <p className="mb-1 text-xs font-medium text-ink">Otomatik görevler (son çalışma)</p>
            {Object.entries(CRON_LABELS).map(([key, label]) => (
              <p key={key} className="text-xs text-ink-muted">
                {label}: {status.cronRuns[key] ?? "hiç çalışmadı"}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
