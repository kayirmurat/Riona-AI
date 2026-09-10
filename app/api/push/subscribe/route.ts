import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Geçersiz abonelik verisi." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (existing) {
    await supabase.from("push_subscriptions").update({ p256dh, auth }).eq("endpoint", endpoint);
  } else {
    await supabase.from("push_subscriptions").insert({ endpoint, p256dh, auth });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint eksik." }, { status: 400 });

  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ success: true });
}
