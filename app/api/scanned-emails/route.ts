import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../lib/integrations/google/tokens";
import { classifyAndStoreEmail } from "../../../lib/ai/mailProcessing";

export const dynamic = "force-dynamic";

const PANEL_WINDOW_HOURS = 48;
const SEARCH_RESULT_LIMIT = 100;
const LIVE_SEARCH_SPARSE_THRESHOLD = 5;
const LIVE_SEARCH_MAX_NEW = 10;
const LIVE_SEARCH_PER_ACCOUNT_LIMIT = 15;

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

// Yerel veritabanımız sadece Riona'nın şimdiye kadar fiilen taradığı mailleri
// içeriyor — "5 ay önce gelen mail" gibi bir arama yerel sonuç bulamayabilir.
// Yerel eşleşme azsa (nadir/eski bir şey aranıyor demektir), Gmail'in kendi
// arama motorunda da aynı sorguyu çalıştırıp eksik olanları normal tarama
// hattından (classifyAndStoreEmail) geçirip veritabanına ekliyoruz — böylece
// sonraki aramalarda da yerelde kalıyorlar ve panel kartları normal şekilde
// çalışıyor (taslak hazırlama, arşivleme vb.).
async function searchLiveGmailAndBackfill(query: string, existingRows: any[]): Promise<any[]> {
  const existingKeys = new Set(existingRows.map((r) => `${r.account_label}:${r.gmail_message_id}`));
  const accounts = await listGoogleAccounts();
  const inserted: any[] = [];
  let remaining = LIVE_SEARCH_MAX_NEW;

  for (const acc of accounts) {
    if (remaining <= 0) break;
    const accessToken = await getValidAccessTokenFor(acc.email);
    if (!accessToken) continue;

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${LIVE_SEARCH_PER_ACCOUNT_LIMIT}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) continue;
    const listData = await listRes.json();
    const ids: string[] = (listData.messages ?? []).map((m: any) => m.id);

    for (const id of ids) {
      if (remaining <= 0) break;
      if (existingKeys.has(`${acc.label}:${id}`)) continue;

      const result = await classifyAndStoreEmail(acc, id, accessToken);
      if (result === "inserted") {
        remaining--;
        const { data: row } = await supabase
          .from("scanned_emails")
          .select("*")
          .eq("gmail_message_id", id)
          .eq("account_label", acc.label)
          .maybeSingle();
        if (row) inserted.push(row);
      }
    }
  }

  return inserted;
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

    let combined = dedupe(data ?? []);
    if (combined.length < LIVE_SEARCH_SPARSE_THRESHOLD) {
      const liveInserted = await searchLiveGmailAndBackfill(q, combined);
      if (liveInserted.length > 0) {
        combined = dedupe([...combined, ...liveInserted]);
        combined.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
    }

    return NextResponse.json({ emails: combined });
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
