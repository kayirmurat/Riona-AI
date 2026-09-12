import { NextRequest, NextResponse } from "next/server";
import { generateDraftForEmail } from "../../../../lib/ai/mailProcessing";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id gerekli." }, { status: 400 });

  const result = await generateDraftForEmail(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Taslak oluşturulamadı." }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
