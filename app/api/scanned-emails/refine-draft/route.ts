import { NextRequest, NextResponse } from "next/server";
import { refineDraft } from "../../../../lib/ai/mailProcessing";

export async function POST(req: NextRequest) {
  const { subject, body, instruction } = await req.json();
  if (typeof instruction !== "string" || !instruction.trim()) {
    return NextResponse.json({ error: "Talimat gerekli." }, { status: 400 });
  }

  try {
    const result = await refineDraft(subject ?? "", body ?? "", instruction.trim());
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Düzenleme yapılamadı." }, { status: 500 });
  }
}
