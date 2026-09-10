import { supabase } from "../db/supabase";

const BRIEFING_WINDOW_HOURS = 48;

export async function buildEmailBriefing(): Promise<string> {
  const since = new Date(Date.now() - BRIEFING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("scanned_emails")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return "Taranan mailler okunurken bir hata oluştu.";
  if (!data || data.length === 0) {
    return "Son 48 saatte taranmış yeni bir mail yok.";
  }

  const seen = new Set<string>();
  const emails = data.filter((row: any) => {
    const key = `${row.account_label}:${row.gmail_message_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const pending = emails.filter((e: any) => e.status === "pending");
  const info = emails.filter((e: any) => e.status === "info");
  const executed = emails.filter((e: any) => e.status === "executed");
  const rejected = emails.filter((e: any) => e.status === "rejected");

  const lines: string[] = [];
  lines.push(`Son 48 saatte ${emails.length} mail tarandı.`);

  if (pending.length > 0) {
    lines.push(`\n📌 Onayını bekleyen ${pending.length} cevap taslağı var:`);
    pending.forEach((e: any) => {
      lines.push(`- "${e.subject || "(konu yok)"}" (${e.from_address}, ${e.account_label}) — panelden onayla/reddet.`);
    });
  } else {
    lines.push("\nOnay bekleyen cevap taslağı yok.");
  }

  if (info.length > 0) {
    lines.push(`\nCevap gerektirmeyen ${info.length} mail bilgi amaçlı tarandı.`);
  }
  if (executed.length > 0 || rejected.length > 0) {
    lines.push(`Daha önce ${executed.length} taslak onaylandı, ${rejected.length} taslak reddedildi.`);
  }

  return lines.join("\n");
}
