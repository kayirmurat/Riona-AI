import { supabase } from "../db/supabase";

export interface PendingAction {
  id: string;
  conversation_id: string;
  tool_name: string;
  arguments: Record<string, any>;
  description: string;
  status: string;
}

export async function createPendingAction(
  conversationId: string,
  toolName: string,
  args: Record<string, any>,
  description: string
): Promise<string> {
  const { data, error } = await supabase
    .from("pending_actions")
    .insert({ conversation_id: conversationId, tool_name: toolName, arguments: args, description })
    .select("id")
    .single();
  if (error || !data) throw new Error("Onay kaydı oluşturulamadı.");
  return data.id;
}

export async function getLatestPendingAction(conversationId: string): Promise<PendingAction | null> {
  const { data } = await supabase
    .from("pending_actions")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PendingAction) ?? null;
}

export async function updatePendingActionStatus(id: string, status: string): Promise<void> {
  await supabase.from("pending_actions").update({ status }).eq("id", id);
}
