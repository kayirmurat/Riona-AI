import { NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("scanned_emails")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "Liste alınamadı." }, { status: 500 });
  return NextResponse.json({ emails: data ?? [] });
}
