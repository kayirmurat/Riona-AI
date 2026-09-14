import { NextRequest, NextResponse } from "next/server";
import { createConversation } from "../../../../lib/ai/conversations";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(process.env.PHONE_BRIDGE_SECRET) && auth === `Bearer ${process.env.PHONE_BRIDGE_SECRET}`;
}

// Her telefon araması, web sohbetindeki diğer konuşmalar gibi bir "conversation"
// satırı olarak kaydediliyor — sidebar'da görünsün, ve içeriği hafıza/
// kişiselleştirme sürecine (lib/ai/personalization.ts) diğer sohbetlerle
// aynı şekilde dahil olsun diye.
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const { callerNumber } = await req.json().catch(() => ({}));

  const timestamp = new Date().toLocaleString("tr-TR", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = `📞 ${callerNumber || "Bilinmeyen numara"} — ${timestamp}`;

  const conversation = await createConversation(title);
  return NextResponse.json({ conversationId: conversation.id });
}
