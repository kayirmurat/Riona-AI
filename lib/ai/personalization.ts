import { supabase } from "../db/supabase";
import { getProvider } from "./provider";

const PROFILE_ROW_ID = "default";
const MAX_MESSAGES_PER_RUN = 300;
const MIN_NEW_MESSAGES = 5;

export async function getPersonalizationSummary(): Promise<string | null> {
  const { data } = await supabase.from("user_profile").select("summary").eq("id", PROFILE_ROW_ID).maybeSingle();
  return data?.summary ?? null;
}

// Günlük olarak (bkz. cron/update-personalization) son analiz edilmemiş
// mesajları alıp, mevcut profille birlikte AI'ya vererek "birleştirilmiş" bir
// profil ürettirir — remember_fact'ten (kesin, kullanıcının açıkça istediği
// bilgi) epistemik olarak ayrı tutuluyor, bu sadece geçmiş konuşmalardan
// çıkarılan gözlemlenen örüntüler.
export async function updatePersonalizationProfile(): Promise<{ analyzed: number; updated: boolean }> {
  const { data: profile } = await supabase
    .from("user_profile")
    .select("summary, last_analyzed_message_at")
    .eq("id", PROFILE_ROW_ID)
    .maybeSingle();

  const previousSummary = profile?.summary ?? null;
  const since = profile?.last_analyzed_message_at ?? "1970-01-01T00:00:00.000Z";

  const { data: messages, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES_PER_RUN);

  if (error || !messages || messages.length < MIN_NEW_MESSAGES) {
    return { analyzed: messages?.length ?? 0, updated: false };
  }

  const transcript = messages.map((m: any) => `${m.role === "user" ? "Kullanıcı" : "Riona"}: ${m.content}`).join("\n");

  const provider = getProvider();
  const response = await provider.chat(
    [
      {
        role: "system",
        content: `Sana kullanıcı hakkında önceki bir profil özeti (varsa) ve son konuşmalardan bir döküm verilecek. SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"summary": string}

Kurallar:
- Önceki profildeki hâlâ geçerli olan bilgiyi koru, çelişen bir şey görürsen güncelle.
- SADECE gerçekten gözlemlenen örüntüleri yaz (ilgi alanları, iletişim tarzı, sık tekrar eden konular/tercihler) — spekülasyon üretme, uydurma.
- Yeterli gözlem yoksa kısa ve genel tut; yokmuş gibi bilgi uydurma.
- Türkçe, akıcı bir metin olarak yaz (madde madde liste değil), en fazla birkaç kısa paragraf.`,
      },
      {
        role: "user",
        content: `Önceki profil: ${previousSummary ?? "(henüz yok)"}\n\nSon konuşmalardan döküm:\n${transcript.slice(0, 20000)}`,
      },
    ],
    undefined,
    undefined,
    { type: "json_object" }
  );

  const parsed = JSON.parse(response.content || "{}");
  const newSummary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : previousSummary;
  if (!newSummary) return { analyzed: messages.length, updated: false };

  const lastMessageAt = messages[messages.length - 1].created_at;
  await supabase.from("user_profile").upsert({
    id: PROFILE_ROW_ID,
    summary: newSummary,
    last_analyzed_message_at: lastMessageAt,
    updated_at: new Date().toISOString(),
  });

  return { analyzed: messages.length, updated: true };
}
