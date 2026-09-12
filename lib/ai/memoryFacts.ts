import { supabase } from "../db/supabase";

const DEFAULT_FACT_LIMIT = 50;

export async function getRecentFacts(limit = DEFAULT_FACT_LIMIT): Promise<string[]> {
  const { data, error } = await supabase
    .from("memory_facts")
    .select("content")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row: any) => row.content as string);
}

export async function addFact(content: string, sourceConversationId?: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;
  await supabase.from("memory_facts").insert({
    content: trimmed,
    source_conversation_id: sourceConversationId ?? null,
  });
}

export interface MemoryFact {
  id: string;
  content: string;
  created_at: string;
}

// Ayarlar panelinde kullanıcının şu ana kadar neyin "hatırlandığını" görüp
// istemediği bir kaydı silebilmesi için — remember_fact/düzeltme mekanizması
// tamamen görünmez kalmasın diye.
export async function getAllFacts(): Promise<MemoryFact[]> {
  const { data, error } = await supabase
    .from("memory_facts")
    .select("id, content, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as MemoryFact[];
}

export async function deleteFact(id: string): Promise<void> {
  await supabase.from("memory_facts").delete().eq("id", id);
}
