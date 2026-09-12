import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/db/supabase";
import { getToolByName } from "../../../lib/ai/toolRegistry";
import { updatePendingActionStatus } from "../../../lib/ai/approval";
import { createEmailDraft, sendEmail } from "../../../lib/integrations/google/gmail";

export const dynamic = "force-dynamic";

// Gerçek ek boyutu, base64 kodlamasıyla ~%33 büyüyor; Vercel'in serverless
// fonksiyon istek boyutu sınırı (~4.5MB) aşılmasın diye kodlanmış ek verisi
// burada 4MB ile sınırlanıyor (ham dosya boyutu bunun biraz altında kalır).
const MAX_ATTACHMENTS_BASE64_BYTES = 4 * 1024 * 1024;

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

  if (action === "approve_draft" || action === "approve_send" || action === "approve") {
    const finalArgs = overrides ? { ...pending.arguments, ...overrides } : pending.arguments;

    if (Array.isArray(finalArgs.attachments)) {
      const totalBytes = finalArgs.attachments.reduce(
        (sum: number, a: any) => sum + (typeof a?.dataBase64 === "string" ? a.dataBase64.length : 0),
        0
      );
      if (totalBytes > MAX_ATTACHMENTS_BASE64_BYTES) {
        return NextResponse.json({ error: "Ek boyutu sınırı (4MB) aşılıyor." }, { status: 400 });
      }
    }

    const threadCtx = {
      threadId: finalArgs.thread_id,
      inReplyTo: finalArgs.in_reply_to,
      cc: finalArgs.cc,
      bcc: finalArgs.bcc,
      attachments: finalArgs.attachments,
    };

    let result: string;
    if (pending.tool_name === "create_email_draft" && action === "approve_send") {
      result = await sendEmail(finalArgs.account, finalArgs.to, finalArgs.subject, finalArgs.body, threadCtx);
    } else if (pending.tool_name === "create_email_draft") {
      result = await createEmailDraft(finalArgs.account, finalArgs.to, finalArgs.subject, finalArgs.body, threadCtx);
    } else {
      const tool = getToolByName(pending.tool_name);
      result = tool ? await tool.execute(finalArgs) : "Araç bulunamadı.";
    }

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
