import { NextRequest, NextResponse } from "next/server";
import { getAllFacts, deleteFact, addFact } from "../../../../lib/ai/memoryFacts";

export const dynamic = "force-dynamic";

export async function GET() {
  const facts = await getAllFacts();
  return NextResponse.json({ facts });
}

// Ayarlar'dan manuel bilgi ekleme — şimdiye kadar sadece sohbet üzerinden
// (remember_fact aracı veya "Bunu düzelt") ekleniyordu.
export async function POST(req: NextRequest) {
  const { content } = await req.json().catch(() => ({}));
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "İçerik boş olamaz." }, { status: 400 });
  }
  await addFact(content);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli." }, { status: 400 });
  await deleteFact(id);
  return NextResponse.json({ success: true });
}
