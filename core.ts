import type { AIProvider, ChatMessage } from "./types";
import { OpenAIAdapter } from "./adapters/openai";

// Model Router'ın en basit hali: şu an tek bir sabit sağlayıcı seçiyor.
// İleride buraya "görev tipine göre adapter seç" mantığı eklenecek,
// ama dışarıdan (API route'tan) hiçbir şey değişmeyecek.
function getProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER ?? "openai";

  switch (providerName) {
    case "openai":
      return new OpenAIAdapter(process.env.OPENAI_API_KEY ?? "");
    // case "anthropic": return new AnthropicAdapter(...)  <-- ileride eklenecek
    // case "gemini": return new GeminiAdapter(...)        <-- ileride eklenecek
    default:
      throw new Error(`Bilinmeyen AI_PROVIDER: ${providerName}`);
  }
}

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "Sen Riona AI'sin, kullanıcının kişisel yapay zeka asistanısın. Kısa, net ve yardımsever cevaplar ver.",
};

export async function askRiona(userMessage: string, history: ChatMessage[] = []): Promise<string> {
  const provider = getProvider();
  const messages: ChatMessage[] = [SYSTEM_PROMPT, ...history, { role: "user", content: userMessage }];
  return provider.chat(messages);
}
