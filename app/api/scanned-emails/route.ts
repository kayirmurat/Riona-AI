import { NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("scanned_emails")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Liste alınamadı." }, { status: 500 });

  const seen = new Set<string>();
  const deduped = (data ?? []).filter((row: any) => {
    const key = `${row.account_label}:${row.gmail_message_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ emails: deduped });
}
