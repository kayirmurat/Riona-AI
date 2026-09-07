import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "../../../lib/ai/memory";

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId eksik." }, { status: 400 });
  }

  const history = await getHistory(conversationId);
  return NextResponse.json({ history });
}
