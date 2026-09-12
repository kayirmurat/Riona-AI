import { NextRequest, NextResponse } from "next/server";
import { getAllFacts, deleteFact } from "../../../../lib/ai/memoryFacts";

export const dynamic = "force-dynamic";

export async function GET() {
  const facts = await getAllFacts();
  return NextResponse.json({ facts });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli." }, { status: 400 });
  await deleteFact(id);
  return NextResponse.json({ success: true });
}
