import type { AIProvider, ChatMessage } from "./types";
import { OpenAIAdapter } from "./adapters/openai";
import { getHistory, saveTurn } from "./memory";
import { availableTools, getToolByName } from "./toolRegistry";

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
    "Sen Riona AI'sin, kullanıcının kişisel yapay zeka asistanısın. Kısa, net ve yardımsever cevaplar ver. Gerekirse elindeki araçları kullan.",
};

export async function askRiona(conversationId: string, userMessage: string): Promise<string> {
  const provider = getProvider();
  const history = await getHistory(conversationId);
  const messages: ChatMessage[] = [SYSTEM_PROMPT, ...history, { role: "user", content: userMessage }];

  const toolDefs = availableTools.map((t) => t.definition);
  const firstResponse = await provider.chat(messages, toolDefs);

  let finalText: string;

  if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
    const toolCall = firstResponse.tool_calls[0];
    const tool = getToolByName(toolCall.name);
    const args = JSON.parse(toolCall.arguments || "{}");
    const toolResult = tool ? await tool.execute(args) : "Araç bulunamadı.";

    const followUpMessages: ChatMessage[] = [
      ...messages,
      firstResponse,
      { role: "tool", content: toolResult, tool_call_id: toolCall.id },
    ];

    const secondResponse = await provider.chat(followUpMessages);
    finalText = secondResponse.content;
  } else {
    finalText = firstResponse.content;
  }

  await saveTurn(conversationId, { role: "user", content: userMessage }, { role: "assistant", content: finalText });
  return finalText;
}
