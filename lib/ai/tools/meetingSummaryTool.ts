import type { Tool } from "../tool";
import { supabase } from "../../db/supabase";

const PREF_KEY = "meeting_summary_language";
const DEFAULT_LANGUAGE = "tr";

async function resolveLanguage(requested?: string): Promise<"tr" | "en"> {
  if (requested === "tr" || requested === "en") {
    await supabase.from("app_preferences").upsert({
      key: PREF_KEY,
      value: requested,
      updated_at: new Date().toISOString(),
    });
    return requested;
  }
  const { data } = await supabase.from("app_preferences").select("value").eq("key", PREF_KEY).maybeSingle();
  return data?.value === "en" ? "en" : DEFAULT_LANGUAGE;
}

export const meetingSummaryTool: Tool = {
  definition: {
    name: "get_meeting_summary",
    description:
      "En son tamamlanmış (transkripti alınmış ve özetlenmiş) toplantının özetini döndürür. Kullanıcı 'bu toplantıyı özetle', 'toplantı özeti', 'son toplantı nasıl geçti', 'summarize the meeting' gibi bir şey sorduğunda bu aracı kullan — mail veya takvim aracıyla karıştırma. Kullanıcı dil belirtmezse (Türkçe/İngilizce) en son istenen dil kullanılır. Bu aracın sonucunu kullanıcıya aktarırken madde madde liste yapma — akıcı, anlatı tarzında anlat.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Toplantı başlığıyla eşleşecek arama terimi (opsiyonel)." },
        language: { type: "string", enum: ["tr", "en"], description: "İstenen özet dili (opsiyonel)." },
      },
    },
  },
  riskLevel: "low",
  async execute(args) {
    const language = await resolveLanguage(args?.language);

    let query = supabase
      .from("meetings")
      .select("title, starts_at, summary_tr, summary_en")
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(1);

    if (typeof args?.query === "string" && args.query.trim()) {
      query = query.ilike("title", `%${args.query.trim()}%`);
    }

    const { data } = await query.maybeSingle();
    if (!data) return "Henüz özetlenmiş bir toplantı bulunamadı.";

    const summary = language === "en" ? data.summary_en : data.summary_tr;
    return summary ?? "Bu toplantı için özet bulunamadı.";
  },
};
