import { NextRequest, NextResponse } from "next/server";
import { getToolByName } from "../../../../lib/ai/toolRegistry";
import { createPendingAction } from "../../../../lib/ai/approval";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(process.env.PHONE_BRIDGE_SECRET) && auth === `Bearer ${process.env.PHONE_BRIDGE_SECRET}`;
}

// Sohbetteki askRiona() döngüsüyle aynı kural: düşük riskli bir araç doğrudan
// çalıştırılır, diğerleri (bkz. takeMessageTool: riskLevel "medium") hiçbir
// zaman doğrudan çalıştırılmaz — mevcut onay kuyruğuna düşer, kullanıcı
// Ayarlar'dan kendisi değerlendirir. Telefonda ayrı bir onay akışı YOK,
// arayan kişi hiçbir şeyi onaylamış olmuyor.
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  const { conversationId, name, arguments: args } = await req.json().catch(() => ({}));

  const tool = name ? getToolByName(name) : undefined;
  if (!tool) return NextResponse.json({ message: "Araç bulunamadı." });

  if (tool.riskLevel !== "low") {
    const description = `Telefon araması: ${tool.definition.name} — ${JSON.stringify(args ?? {})}`;
    await createPendingAction(conversationId ?? "phone-system", tool.definition.name, args ?? {}, description);
    return NextResponse.json({ message: "Not alındı, kullanıcının onayına/değerlendirmesine sunuldu." });
  }

  const result = await tool.execute(args ?? {}, { conversationId });
  return NextResponse.json({ message: result });
}
