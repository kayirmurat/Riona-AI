import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { count, error } = await supabase
    .from("scanned_emails")
    .select("id", { count: "exact", head: true })
    .eq("needs_reply", true)
    .eq("status", "pending");

  if (error) return NextResponse.json({ error: "Sayı alınamadı." }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
