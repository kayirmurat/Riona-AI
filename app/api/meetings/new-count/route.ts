import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

export const dynamic = "force-dynamic";

const NOTIFIABLE_STATUSES = ["transcribed", "completed"];

// "Yeni" tanımı kullanıcının cihazında (localStorage) tutulan son görülme
// zamanına göre; sunucu tarafında bir "görüldü" kaydı yok — bu yüzden `since`
// parametresi zorunlu bir filtre, sunucuda ayrı bir kalıcı durum gerekmiyor.
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");

  let query = supabase.from("meetings").select("id", { count: "exact", head: true }).in("status", NOTIFIABLE_STATUSES);
  if (since) query = query.gt("updated_at", since);

  const { count, error } = await query;
  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
