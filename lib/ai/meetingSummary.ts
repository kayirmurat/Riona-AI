import { getProvider } from "./provider";

export interface MeetingSummaryResult {
  summary_tr: string;
  summary_en: string;
}

const FALLBACK: MeetingSummaryResult = {
  summary_tr: "Özet oluşturulamadı.",
  summary_en: "Summary could not be generated.",
};

// Meeting BaaS'ın transkript alanının tam şekli değişebilir (görülen gerçek
// canlı örnekte {speaker, ...} ile birlikte boş bir dizi de gelebiliyor) —
// olası alan adlarını sırayla dener, esnek kalır.
function flattenTranscript(transcript: unknown): string {
  if (!Array.isArray(transcript)) return "";
  return transcript
    .map((line: any) => {
      const speaker = line?.speaker ?? line?.speaker_name ?? line?.name ?? "Konuşmacı";
      const text = line?.text ?? line?.words ?? line?.message ?? "";
      return text ? `${speaker}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// Transkript boşsa (bot toplantıya giremedi/konuşma yakalanamadı) AI çağrısı
// hiç yapılmıyor — hem gereksiz maliyet hem de içeriksiz bir "özet" uydurmak
// yerine çağıran taraf status'u 'transcribed' seviyesinde bırakabilsin diye.
export async function summarizeMeeting(transcript: unknown): Promise<MeetingSummaryResult | null> {
  const text = flattenTranscript(transcript);
  if (!text.trim()) return null;

  try {
    const provider = getProvider();
    const response = await provider.chat(
      [
        {
          role: "system",
          content: `Sana bir toplantı transkripti verilecek. SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"summary_tr": string, "summary_en": string}

Kurallar:
- summary_tr Türkçe, summary_en İngilizce olsun; ikisi de aynı içeriği anlatı tarzında (madde madde liste değil, akıcı bir metin olarak) versin.
- Kimler katıldı (konuşmacı isimleri belirtilmişse), ana gündem maddeleri, alınan kararlar ve varsa sorumlusuyla birlikte aksiyon maddeleri kapsanmalı.
- Transkriptte konuşmacı isimleri "Speaker 1" gibi genel etiketlerse bunu olduğu gibi kullan, isim uydurma.`,
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
      undefined,
      undefined,
      { type: "json_object" }
    );

    const parsed = JSON.parse(response.content || "{}");
    return {
      summary_tr: typeof parsed.summary_tr === "string" && parsed.summary_tr.trim() ? parsed.summary_tr : FALLBACK.summary_tr,
      summary_en: typeof parsed.summary_en === "string" && parsed.summary_en.trim() ? parsed.summary_en : FALLBACK.summary_en,
    };
  } catch (err) {
    console.error("[ai/meetingSummary] özetleme hatası:", err);
    return FALLBACK;
  }
}
