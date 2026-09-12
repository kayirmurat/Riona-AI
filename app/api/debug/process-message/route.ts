import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";
import { getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { classifyAndStoreEmail } from "../../../../lib/ai/mailProcessing";

// Tek seferlik teşhis aracı — belirli bir Gmail mesajının neden hiç
// scanned_emails'e düşmediğini (sessizce "already_scanned" mi, fetch hatası mı,
// yakalanmamış bir exception mı) doğrudan görebilmek için.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;
  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  const messageId = req.nextUrl.searchParams.get("messageId");
  if (!email || !messageId) {
    return NextResponse.json({ error: "email/messageId gerekli." }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("google_accounts")
    .select("email, label")
    .eq("email", email)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });

  const { data: existingRow } = await supabase
    .from("scanned_emails")
    .select("id, status, needs_reply, created_at")
    .eq("gmail_message_id", messageId)
    .eq("account_label", account.label)
    .maybeSingle();

  const accessToken = await getValidAccessTokenFor(account.email);
  if (!accessToken) return NextResponse.json({ error: "Token alınamadı." }, { status: 500 });

  try {
    const result = await classifyAndStoreEmail({ email: account.email, label: account.label }, messageId, accessToken);
    return NextResponse.json({ success: true, result, existingRowBeforeCall: existingRow ?? null });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err), stack: err?.stack, existingRowBeforeCall: existingRow ?? null },
      { status: 500 }
    );
  }
}
