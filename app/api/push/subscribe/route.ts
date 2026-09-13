import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

const PREF_KEYS = ["notify_mail", "notify_digest", "notify_health"] as const;

// Bir aboneliğin bildirim türü tercihlerini döner — sütunlar henüz
// eklenmemişse (migration çalıştırılmadan önce) varsayılan olarak hepsi
// açık sayılır.
export async function GET(req: NextRequest) {
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint eksik." }, { status: 400 });

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("notify_mail, notify_digest, notify_health")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ notify_mail: true, notify_digest: true, notify_health: true });
  }
  return NextResponse.json({
    notify_mail: data.notify_mail ?? true,
    notify_digest: data.notify_digest ?? true,
    notify_health: data.notify_health ?? true,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint eksik." }, { status: 400 });

  const update: Record<string, boolean> = {};
  for (const key of PREF_KEYS) {
    if (typeof body[key] === "boolean") update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").update(update).eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: "Tercih kaydedilemedi." }, { status: 500 });
  return NextResponse.json({ success: true });
}

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
