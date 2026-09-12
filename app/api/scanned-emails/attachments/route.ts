import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";
import { fetchAttachmentData } from "../../../../lib/integrations/google/gmail";

export async function GET(req: NextRequest) {
  const emailId = req.nextUrl.searchParams.get("emailId");
  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!emailId || !attachmentId) {
    return NextResponse.json({ error: "emailId/attachmentId eksik." }, { status: 400 });
  }

  const { data: email } = await supabase
    .from("scanned_emails")
    .select("gmail_message_id, account_label, attachments")
    .eq("id", emailId)
    .maybeSingle();
  if (!email) return NextResponse.json({ error: "Mail bulunamadı." }, { status: 404 });

  const attachment = (email.attachments ?? []).find((a: any) => a.attachmentId === attachmentId);
  if (!attachment) return NextResponse.json({ error: "Ek bulunamadı." }, { status: 404 });

  const data = await fetchAttachmentData(email.account_label, email.gmail_message_id, attachmentId);
  if (!data) return NextResponse.json({ error: "Ek indirilemedi." }, { status: 500 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    },
  });
}
