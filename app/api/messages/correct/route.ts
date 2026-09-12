import { NextRequest, NextResponse } from "next/server";
import { addFact } from "../../../../lib/ai/memoryFacts";

// Model kendi kendine remember_fact aracını sadece kullanıcı açıkça "hatırla"
// dediğinde çağırıyor — ama kullanıcı bir yanıtı sıradan bir "hayır, öyle
// değil" ile düzelttiğinde bu genelde tetiklenmiyor ve düzeltme bir dahaki
// sohbette unutuluyor (canlı testte gözlemlenen "emekli asistan" hatası tam
// bu sınıftan). Bu uç nokta, sohbetteki her asistan mesajının altına bir
// "Bunu düzelt" affordance'ı ekleyebilmek için var — kullanıcı doğrudan bir
// düzeltme yazdığında bunu aynı memory_facts tablosuna (remember_fact ile
// birebir aynı mekanizma, system prompt'a otomatik enjekte ediliyor) kaydeder.
export async function POST(req: NextRequest) {
  const { wrongText, correction, conversationId } = await req.json();

  if (typeof correction !== "string" || !correction.trim()) {
    return NextResponse.json({ error: "Düzeltme metni gerekli." }, { status: 400 });
  }

  const snippet = typeof wrongText === "string" ? wrongText.trim().slice(0, 200) : "";
  const factContent = snippet
    ? `[Düzeltme] Riona şunu söylemişti: "${snippet}" — Bu YANLIŞTI. Doğrusu: ${correction.trim()}`
    : `[Düzeltme] ${correction.trim()}`;

  await addFact(factContent, typeof conversationId === "string" ? conversationId : undefined);

  return NextResponse.json({ success: true });
}
