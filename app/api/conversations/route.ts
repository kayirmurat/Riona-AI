import { NextRequest, NextResponse } from "next/server";
import { listConversations, createConversation } from "../../../lib/ai/conversations";

export async function GET() {
  const conversations = await listConversations();
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : undefined;
  const conversation = await createConversation(title);
  return NextResponse.json({ conversation });
}
