import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

// newCategory null ise o kategorideki mailler kategorisiz bırakılır (kaldırma);
// bir string ise o kategorideki tüm mailler yeni isme taşınır (yeniden adlandırma).
export async function PATCH(req: NextRequest) {
  const { oldCategory, newCategory } = await req.json();
  if (typeof oldCategory !== "string" || !oldCategory.trim()) {
    return NextResponse.json({ error: "oldCategory gerekli." }, { status: 400 });
  }

  const { error } = await supabase
    .from("scanned_emails")
    .update({ category: typeof newCategory === "string" && newCategory.trim() ? newCategory.trim() : null })
    .eq("category", oldCategory);

  if (error) return NextResponse.json({ error: "Kategori güncellenemedi." }, { status: 500 });
  return NextResponse.json({ success: true });
}
