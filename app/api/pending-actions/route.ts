import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";
import { getToolByName } from "../../../lib/ai/toolRegistry";
import { updatePendingActionStatus } from "../../../lib/ai/approval";

export async function GET() {
  const { data, error } = await supabase
    .from("pending_actions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Liste alınamadı." }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { id, action } = await req.json();

  const { data: pending } = await supabase.from("pending_actions").select("*").eq("id", id).single();
  if (!pending) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  if (action === "approve") {
    const tool = getToolByName(pending.tool_name);
    const result = tool ? await tool.execute(pending.arguments) : "Araç bulunamadı.";
    await updatePendingActionStatus(id, "executed");
    return NextResponse.json({ success: true, result });
  }

  if (action === "reject") {
    await updatePendingActionStatus(id, "rejected");
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Geçersiz aksiyon." }, { status: 400 });
}
