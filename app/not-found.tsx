export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-ink">Sayfa bulunamadı</h1>
        <p className="mb-6 text-sm text-ink-muted">Aradığın sayfa mevcut değil ya da taşınmış olabilir.</p>
        <a
          href="/"
          className="inline-block w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Ana Sayfaya Dön
        </a>
      </div>
    </main>
  );
}
