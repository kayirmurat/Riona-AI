import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";
import { archiveEmail, trashEmail, markEmailRead, markEmailUnread } from "../../../../lib/integrations/google/gmail";

type Action = "archive" | "trash" | "mark_read" | "mark_unread";
const VALID_ACTIONS: Action[] = ["archive", "trash", "mark_read", "mark_unread"];

async function performAction(id: string, action: Action): Promise<{ id: string; ok: boolean; error?: string }> {
  const { data: email } = await supabase
    .from("scanned_emails")
    .select("gmail_message_id, account_label")
    .eq("id", id)
    .maybeSingle();
  if (!email) return { id, ok: false, error: "Mail bulunamadı." };

  let ok = false;
  if (action === "archive") ok = await archiveEmail(email.account_label, email.gmail_message_id);
  else if (action === "trash") ok = await trashEmail(email.account_label, email.gmail_message_id);
  else if (action === "mark_read") ok = await markEmailRead(email.account_label, email.gmail_message_id);
  else if (action === "mark_unread") ok = await markEmailUnread(email.account_label, email.gmail_message_id);

  if (!ok) return { id, ok: false, error: "Gmail işlemi başarısız." };

  // mark_read/mark_unread Gmail tarafında sadece bir label değişikliği,
  // bizim durum akışımızı (pending/info/executed/rejected) etkilemiyor —
  // sadece archive/trash maili "bitmiş" sayıp Geçmiş sekmesine taşıyor.
  if (action === "archive" || action === "trash") {
    await supabase
      .from("scanned_emails")
      .update({ status: action === "archive" ? "archived" : "trashed" })
      .eq("id", id);
  }

  return { id, ok: true };
}

export async function POST(req: NextRequest) {
  const { id, ids, action } = await req.json();
  const targetIds: string[] = Array.isArray(ids) ? ids : id ? [id] : [];

  if (targetIds.length === 0 || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "id/ids ve geçerli bir action gerekli." }, { status: 400 });
  }

  const results = await Promise.all(targetIds.map((targetId) => performAction(targetId, action)));
  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ success: allOk, results });
}
