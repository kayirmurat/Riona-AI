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
