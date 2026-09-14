import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(process.env.PHONE_BRIDGE_SECRET) && auth === `Bearer ${process.env.PHONE_BRIDGE_SECRET}`;
}

// Aramanın transkripti (hem arayanın hem Riona'nın konuştukları) tek tek
// gelirken web sohbetindeki mesajlarla aynı tabloya yazılıyor — arama
// bittikten sonra ilgili "conversation" açılıp geçmiş gibi okunabilsin diye.
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const { conversationId, role, content } = await req.json().catch(() => ({}));

  if (!conversationId || !role || !content) {
    return NextResponse.json({ error: "Eksik alan." }, { status: 400 });
  }

  await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  return NextResponse.json({ success: true });
}
