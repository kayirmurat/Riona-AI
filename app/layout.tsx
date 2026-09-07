export const metadata = {
  title: "Riona AI",
  description: "Kişisel AI asistanı",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
