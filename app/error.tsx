"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Beklenmeyen hata:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-ink">Bir şeyler ters gitti</h1>
        <p className="mb-6 text-sm text-ink-muted">Beklenmeyen bir hata oluştu. Tekrar denemek ister misin?</p>
        <button
          onClick={reset}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Tekrar Dene
        </button>
      </div>
    </main>
  );
}
