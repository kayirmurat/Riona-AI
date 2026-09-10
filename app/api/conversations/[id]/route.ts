import { NextRequest, NextResponse } from "next/server";
import { renameConversation, deleteConversation } from "../../../../lib/ai/conversations";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "";
  if (!title.trim()) {
    return NextResponse.json({ error: "Başlık boş olamaz." }, { status: 400 });
  }
  await renameConversation(params.id, title);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await deleteConversation(params.id);
  return NextResponse.json({ success: true });
}
