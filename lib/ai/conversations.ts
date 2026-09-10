import { supabase } from "../db/supabase";

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TITLE = "Yeni sohbet";

function deriveTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  if (!trimmed) return DEFAULT_TITLE;
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data as Conversation[];
}

export async function createConversation(title?: string): Promise<Conversation> {
  const id = crypto.randomUUID();
  const row = {
    id,
    title: title?.trim() || DEFAULT_TITLE,
  };
  const { data, error } = await supabase.from("conversations").insert(row).select("*").single();
  if (error || !data) throw new Error("Oturum oluşturulamadı.");
  return data as Conversation;
}

// Var olan bir konuşmanın updated_at'ini günceller; satır hiç yoksa (örn. eski
// localStorage'daki konuşma id'si veya cron'un kullandığı sözde-id) otomatik oluşturur.
export async function touchOrCreateConversation(id: string, firstMessage?: string): Promise<void> {
  const { data: existing } = await supabase.from("conversations").select("id").eq("id", id).maybeSingle();

  if (existing) {
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
    return;
  }

  await supabase.from("conversations").insert({
    id,
    title: firstMessage ? deriveTitle(firstMessage) : DEFAULT_TITLE,
  });
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Başlık boş olamaz.");
  await supabase.from("conversations").update({ title: trimmed }).eq("id", id);
}

export async function deleteConversation(id: string): Promise<void> {
  // FK/cascade garantisi olmadığı için iki adımda, uygulama seviyesinde siliniyor.
  await supabase.from("messages").delete().eq("conversation_id", id);
  await supabase.from("conversations").delete().eq("id", id);
}
