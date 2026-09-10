import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";
import { getToolByName } from "../../../lib/ai/toolRegistry";
import { updatePendingActionStatus } from "../../../lib/ai/approval";

export const dynamic = "force-dynamic";

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
  const { id, action, overrides } = await req.json();

  const { data: pending } = await supabase.from("pending_actions").select("*").eq("id", id).single();
  if (!pending) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });

  if (action === "approve") {
    const finalArgs = overrides ? { ...pending.arguments, ...overrides } : pending.arguments;
    const tool = getToolByName(pending.tool_name);
    const result = tool ? await tool.execute(finalArgs) : "Araç bulunamadı.";
    await updatePendingActionStatus(id, "executed");
    await supabase.from("scanned_emails").update({ status: "executed" }).eq("pending_action_id", id);
    return NextResponse.json({ success: true, result });
  }

  if (action === "reject") {
    await updatePendingActionStatus(id, "rejected");
    await supabase.from("scanned_emails").update({ status: "rejected" }).eq("pending_action_id", id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Geçersiz aksiyon." }, { status: 400 });
}
