import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";
import { archiveEmail, trashEmail, markEmailRead } from "../../../../lib/integrations/google/gmail";

export async function POST(req: NextRequest) {
  const { id, action } = await req.json();
  if (!id || !action) return NextResponse.json({ error: "id/action eksik." }, { status: 400 });

  const { data: email } = await supabase
    .from("scanned_emails")
    .select("gmail_message_id, account_label")
    .eq("id", id)
    .maybeSingle();
  if (!email) return NextResponse.json({ error: "Mail bulunamadı." }, { status: 404 });

  let ok = false;
  if (action === "archive") ok = await archiveEmail(email.account_label, email.gmail_message_id);
  else if (action === "trash") ok = await trashEmail(email.account_label, email.gmail_message_id);
  else if (action === "mark_read") ok = await markEmailRead(email.account_label, email.gmail_message_id);
  else return NextResponse.json({ error: "Geçersiz aksiyon." }, { status: 400 });

  if (!ok) return NextResponse.json({ error: "Gmail işlemi başarısız." }, { status: 500 });

  // mark_read Gmail tarafında bir label değişikliği, bizim durum akışımızı
  // (pending/info/executed/rejected) etkilemiyor — sadece archive/trash
  // maili "bitmiş" sayıp Geçmiş sekmesine taşıyor.
  if (action === "archive" || action === "trash") {
    await supabase
      .from("scanned_emails")
      .update({ status: action === "archive" ? "archived" : "trashed" })
      .eq("id", id);
  }

  return NextResponse.json({ success: true });
}
