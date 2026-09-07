export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
}
