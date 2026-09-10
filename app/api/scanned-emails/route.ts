import { NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";

const PANEL_WINDOW_HOURS = 48;

export async function GET() {
  const { data, error } = await supabase
    .from("scanned_emails")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Liste alınamadı." }, { status: 500 });

  const seen = new Set<string>();
  const deduped = (data ?? []).filter((row: any) => {
    const key = `${row.account_label}:${row.gmail_message_id ?? row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const since = Date.now() - PANEL_WINDOW_HOURS * 60 * 60 * 1000;
  const recentOrPending = deduped.filter(
    (row: any) => row.status === "pending" || new Date(row.created_at).getTime() >= since
  );

  return NextResponse.json({ emails: recentOrPending });
}
