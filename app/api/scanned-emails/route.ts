import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";

export const dynamic = "force-dynamic";

const PANEL_WINDOW_HOURS = 48;
const SEARCH_RESULT_LIMIT = 100;

function dedupe(rows: any[]): any[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.account_label}:${row.gmail_message_id ?? row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// PostgREST'in or() filtre sözdizimi virgülü koşul ayracı olarak kullanıyor —
// arama metninde virgül varsa filtreyi bozmasın diye kaldırılıyor.
function escapeIlikeValue(value: string): string {
  return value.replace(/,/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  // Arama, normal panel penceresinin (son 48 saat + bekleyenler) DIŞINDA kalan
  // tüm mail geçmişini kapsar — kullanıcının "geçen ay gelen o mail" gibi bir
  // şeyi bulabilmesi için zaman penceresi burada bilerek yok.
  if (q) {
    const pattern = `%${escapeIlikeValue(q)}%`;
    const { data, error } = await supabase
      .from("scanned_emails")
      .select("*")
      .or(`subject.ilike.${pattern},from_address.ilike.${pattern},snippet.ilike.${pattern},body_text.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(SEARCH_RESULT_LIMIT);

    if (error) return NextResponse.json({ error: "Arama yapılamadı." }, { status: 500 });
    return NextResponse.json({ emails: dedupe(data ?? []) });
  }

  const { data, error } = await supabase
    .from("scanned_emails")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Liste alınamadı." }, { status: 500 });

  const deduped = dedupe(data ?? []);
  const since = Date.now() - PANEL_WINDOW_HOURS * 60 * 60 * 1000;
  const recentOrPending = deduped.filter(
    (row: any) => row.status === "pending" || new Date(row.created_at).getTime() >= since
  );

  return NextResponse.json({ emails: recentOrPending });
}
