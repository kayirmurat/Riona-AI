import { NextRequest, NextResponse } from "next/server";
import { getPhoneToolDefinitions } from "../../../../lib/ai/phoneTools";

export const dynamic = "force-dynamic";

// Telefon köprü sunucusu (phone-bridge/) her aramanın başında bunu çağırıp
// OpenAI Realtime oturumuna vereceği sistem talimatını ve dar araç setini
// alır. Arayan kişi kim olursa olsun aynı, kısıtlı yetkiyle davranır —
// sohbetteki tam yetkili Riona ile karıştırılmasın diye bilinçli olarak ayrı.
const PHONE_SYSTEM_PROMPT = `Sen Riona'sın, bu işletmenin telefon hattına bakan yapay zeka asistanısın. Arayan kişiyle doğal, kısa, sıcak bir şekilde konuş — arayan Türkçe konuşuyorsa Türkçe, İngilizce konuşuyorsa İngilizce cevap ver. Madde işaretli liste veya markdown biçimlendirme KULLANMA, cevabın yüksek sesle okunuyor. Önce kim olduğunu ve ne için aradığını nazikçe sor. Bu hat üzerinden arayan kişilere hiçbir özel/kişisel bilgi (randevu detayı, mail/takvim içeriği, kişisel bilgi) VERME — bu bilgilere erişimin yok. Bir istek, mesaj veya geri arama talebi ilettiğinde take_message aracını çağırarak kaydet, sonra arayana "notunuzu aldım, en kısa sürede size dönüş yapılacak" gibi bir şey söyle. Hiçbir zaman "işleminiz tamamlandı" gibi bir şey söyleme — sadece notunun alındığını söyle.`;

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(process.env.PHONE_BRIDGE_SECRET) && auth === `Bearer ${process.env.PHONE_BRIDGE_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  return NextResponse.json({
    instructions: PHONE_SYSTEM_PROMPT,
    tools: getPhoneToolDefinitions(),
  });
}
