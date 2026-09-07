import { supabase } from "../db/supabase";
import type { ChatMessage } from "./types";

export async function getHistory(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Memory getHistory error:", error);
    return [];
  }

  return (data ?? []) as ChatMessage[];
}

export async function saveTurn(
  conversationId: string,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage
): Promise<void> {
  const { error } = await supabase.from("messages").insert([
    { conversation_id: conversationId, role: userMessage.role, content: userMessage.content },
    { conversation_id: conversationId, role: assistantMessage.role, content: assistantMessage.content },
  ]);

  if (error) {
    console.error("Memory saveTurn error:", error);
  }
}
