import type { AIProvider, ChatMessage, ToolChoice } from "./types";
import { OpenAIAdapter } from "./adapters/openai";
import { getHistory, saveTurn } from "./memory";
import { availableTools, getToolByName } from "./toolRegistry";
import { createPendingAction, getLatestPendingAction, updatePendingActionStatus } from "./approval";

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
    "Sen Riona AI'sin, kullanıcının kişisel yapay zeka asistanısın. Gmail ve Google Calendar hesaplarına bağlısın. E-posta okuma/takvim görüntüleme gibi işlemleri doğrudan yapabilirsin. E-posta taslağı oluşturmak gibi işlemler için sistem otomatik olarak kullanıcıdan onay isteyecek, sen sadece gerekli bilgileri (kime, konu, içerik) topla ve aracı çağır. Kısa, net ve yardımsever cevaplar ver.",
};

const EMAIL_KEYWORDS = ["mail", "e-posta", "eposta", "gmail", "gelen kutu", "inbox"];
const CALENDAR_KEYWORDS = ["takvim", "calendar", "etkinlik", "toplantı", "randevu"];

function detectForcedTool(userMessage: string): string | null {
  const lower = userMessage.toLowerCase();
  if (EMAIL_KEYWORDS.some((k) => lower.includes(k))) return "get_recent_emails";
  if (CALENDAR_KEYWORDS.some((k) => lower.includes(k))) return "get_upcoming_events";
  return null;
}

const APPROVE_WORDS = ["onaylıyorum", "onayla", "evet yap", "onay", "tamam yap"];
const REJECT_WORDS = ["iptal", "vazgeç", "yapma"];

export async function askRiona(conversationId: string, userMessage: string): Promise<string> {
  const pending = await getLatestPendingAction(conversationId);
  if (pending) {
    const lower = userMessage.toLowerCase();
    if (APPROVE_WORDS.some((w) => lower.includes(w))) {
      const tool = getToolByName(pending.tool_name);
      const result = tool ? await tool.execute(pending.arguments) : "Araç bulunamadı.";
      await updatePendingActionStatus(pending.id, "executed");
      await saveTurn(conversationId, { role: "user", content: userMessage }, { role: "assistant", content: result });
      return result;
    }
    if (REJECT_WORDS.some((w) => lower.includes(w))) {
      await updatePendingActionStatus(pending.id, "rejected");
      const replyText = "Tamam, bu işlemi iptal ettim.";
      await saveTurn(conversationId, { role: "user", content: userMessage }, { role: "assistant", content: replyText });
      return replyText;
    }
  }

  const provider = getProvider();
  const history = await getHistory(conversationId);
  const messages: ChatMessage[] = [SYSTEM_PROMPT, ...history, { role: "user", content: userMessage }];

  const toolDefs = availableTools.map((t) => t.definition);
  const forced = detectForcedTool(userMessage);
  const toolChoice: ToolChoice = forced ? { type: "function", name: forced } : "auto";

  const firstResponse = await provider.chat(messages, toolDefs, toolChoice);

  let finalText: string;

  if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
    const toolCall = firstResponse.tool_calls[0];
    const tool = getToolByName(toolCall.name);
    const args = JSON.parse(toolCall.arguments || "{}");

    if (tool && tool.riskLevel !== "low") {
      const description = `${tool.definition.name} çalıştırılmak isteniyor. Parametreler: ${JSON.stringify(args)}`;
      await createPendingAction(conversationId, tool.definition.name, args, description);
      finalText = `Bunu yapmak için onayına ihtiyacım var:\n\n${description}\n\nOnaylıyorsan "onaylıyorum" yaz, istemiyorsan "iptal" yaz.`;
    } else {
      const toolResult = tool ? await tool.execute(args) : "Araç bulunamadı.";
      const followUpMessages: ChatMessage[] = [
        ...messages,
        firstResponse,
        { role: "tool", content: toolResult, tool_call_id: toolCall.id },
      ];
      const secondResponse = await provider.chat(followUpMessages);
      finalText = secondResponse.content;
    }
  } else {
    finalText = firstResponse.content;
  }

  await saveTurn(conversationId, { role: "user", content: userMessage }, { role: "assistant", content: finalText });
  return finalText;
}
