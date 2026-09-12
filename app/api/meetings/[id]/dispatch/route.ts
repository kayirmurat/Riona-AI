import { NextResponse } from "next/server";
import { dispatchSingleMeeting } from "../../../../../lib/meetings/dispatch";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const result = await dispatchSingleMeeting(params.id);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ success: true, message: result.message });
}
