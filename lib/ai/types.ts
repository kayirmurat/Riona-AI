export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export type ToolChoice = "auto" | { type: "function"; name: string };

// Bugün yalnızca OpenAI'ın "json_object" modunu karşılıyor. Başka bir adaptör
// eklenirse kendi karşılığına çevirebilir veya yok sayabilir — model-agnostik
// arayüzü bozmadan yapılandırılmış (JSON) çıktı istemek için opsiyonel bir kapı.
export type ResponseFormat = { type: "json_object" };

export interface AIProvider {
  name: string;
  chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    toolChoice?: ToolChoice,
    responseFormat?: ResponseFormat
  ): Promise<ChatMessage>;
}
