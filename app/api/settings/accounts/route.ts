import { NextRequest, NextResponse } from "next/server";
import { listGoogleAccounts } from "../../../../lib/integrations/google/tokens";
import { supabase } from "../../../../lib/db/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await listGoogleAccounts();
  return NextResponse.json({ accounts });
}

// Hesabın bağlantısını keser — sadece google_accounts satırını siler.
// gmail_watch_state/calendar_watch_state kayıtları kasıtlı olarak
// bırakılıyor: listGoogleAccounts() artık bu hesabı döndürmediği için
// sağlık kontrolü ve cron'lar zaten onu görmezden geliyor, zararsız
// kalıyorlar (Google tarafında ayrıca stop() çağırmaya gerek yok).
export async function DELETE(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email eksik." }, { status: 400 });

  await supabase.from("google_accounts").delete().eq("email", email);
  return NextResponse.json({ success: true });
}
