import type { AIProvider, ChatMessage } from "./types";
import { OpenAIAdapter } from "./adapters/openai";
import { getHistory, saveTurn } from "./memory";

function getProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER ?? "openai";
  switch (providerName) {
    case "openai":
      return new OpenAIAdapter(process.env.OPENAI_API_KEY ?? "");
    default:
      throw new Error(`Bilinmeyen AI_PROVIDER: ${providerName}`);
  }
}

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "Sen Riona AI'sin, kullanıcının kişisel yapay zeka asistanısın. Kısa, net ve yardımsever cevaplar ver.",
};

export async function askRiona(conversationId: string, userMessage: string): Promise<string> {
  const provider = getProvider();
  const history = await getHistory(conversationId);
  const messages: ChatMessage[] = [SYSTEM_PROMPT, ...history, { role: "user", content: userMessage }];
  const replyText = await provider.chat(messages);
  await saveTurn(conversationId, { role: "user", content: userMessage }, { role: "assistant", content: replyText });
  return replyText;
}
