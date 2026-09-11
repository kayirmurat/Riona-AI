import type { ChatMessage, ToolChoice } from "./types";
import { getProvider } from "./provider";
import { getHistory, saveTurn } from "./memory";
import { availableTools, getToolByName } from "./toolRegistry";
import { createPendingAction, getLatestPendingAction, updatePendingActionStatus } from "./approval";
import { touchOrCreateConversation } from "./conversations";
import { getRecentFacts } from "./memoryFacts";

const BASE_SYSTEM_PROMPT =
  "Sen Riona AI'sin, kullanıcının kişisel yapay zeka asistanısın. Gerçekten Gmail ve Google Calendar hesaplarına bağlısın. get_recent_emails, get_upcoming_events, create_email_draft ve get_email_briefing araçlarıyla gerçek işlemler yapabiliyorsun. Kullanıcı bir taslak/e-posta/takvimden bahsettiğinde bunu asla sorgulama veya bağlı olmadığını varsayma, doğrudan ilgili aracı çağır. Kullanıcı günlük durumu, bekleyen onayları veya 'mailler nasıl' gibi genel bir şey sorduğunda get_email_briefing aracını kullanarak taranan mailleri ve bekleyen onayları hatırlat. Mailleri özetlerken madde madde liste yapma — kimden geldiğini, ne istediğini/amaçladığını ve aksiyon gerekip gerekmediğini akıcı, anlatı tarzında, kısa bir 'durum özeti' gibi doğal cümlelerle anlat. Kullanıcının farklı bir sohbette (oturumda) söylediği ama burada tekrar etmediği bir tercih/karar sorulursa 'bilmiyorum' deme — aşağıdaki 'Bilinen kalıcı bilgiler' listesine bak, orada varsa onu kullan. Kullanıcı kalıcı olarak hatırlanması gereken bir tercih/karar belirttiğinde remember_fact aracını çağır. Kısa, net ve yardımsever cevaplar ver.";

async function buildSystemPrompt(): Promise<ChatMessage> {
  const facts = await getRecentFacts();
  if (facts.length === 0) return { role: "system", content: BASE_SYSTEM_PROMPT };

  const factsList = facts.map((f) => `- ${f}`).join("\n");
  return {
    role: "system",
    content: `${BASE_SYSTEM_PROMPT}\n\nBilinen kalıcı bilgiler/tercihler (diğer oturumlarda öğrenildi):\n${factsList}`,
  };
}

const MEETING_MENTION_KEYWORDS = ["toplantı", "meeting"];
const SUMMARY_KEYWORDS = ["özet", "summar"];
const BRIEFING_KEYWORDS = ["hatırlat", "brifing", "briefing", "özet", "bekleyen", "durum ne", "ne var", "bugün mail"];
const EMAIL_KEYWORDS = ["mail", "e-posta", "eposta", "gmail", "gelen kutu", "inbox"];
const CALENDAR_KEYWORDS = ["takvim", "calendar", "etkinlik", "toplantı", "randevu"];
const DRAFT_KEYWORDS = ["taslak", "draft"];

function detectForcedTool(userMessage: string): string | null {
  const lower = userMessage.toLowerCase();
  // "bu toplantıyı özetle" gibi mesajlar hem "özet" (BRIEFING_KEYWORDS) hem
  // "toplantı" (CALENDAR_KEYWORDS) içerdiği için bu kontrol ikisinden de önce
  // gelmeli, yoksa hiçbir zaman get_meeting_summary'ye ulaşılamaz.
  if (
    MEETING_MENTION_KEYWORDS.some((k) => lower.includes(k)) &&
    SUMMARY_KEYWORDS.some((k) => lower.includes(k))
  ) {
    return "get_meeting_summary";
  }
  if (BRIEFING_KEYWORDS.some((k) => lower.includes(k))) return "get_email_briefing";
  if (DRAFT_KEYWORDS.some((k) => lower.includes(k))) return "create_email_draft";
  if (EMAIL_KEYWORDS.some((k) => lower.includes(k))) return "get_recent_emails";
  if (CALENDAR_KEYWORDS.some((k) => lower.includes(k))) return "get_upcoming_events";
  return null;
}

const APPROVE_WORDS = ["onaylıyorum", "onayla", "evet yap", "onay", "tamam yap"];
const REJECT_WORDS = ["iptal", "vazgeç", "yapma"];

export async function askRiona(conversationId: string, userMessage: string): Promise<string> {
  await touchOrCreateConversation(conversationId, userMessage);
  const toolContext = { conversationId };

  const pending = await getLatestPendingAction(conversationId);
  if (pending) {
    const lower = userMessage.toLowerCase();
    if (APPROVE_WORDS.some((w) => lower.includes(w))) {
      const tool = getToolByName(pending.tool_name);
      const result = tool ? await tool.execute(pending.arguments, toolContext) : "Araç bulunamadı.";
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
  const systemPrompt = await buildSystemPrompt();
  const messages: ChatMessage[] = [systemPrompt, ...history, { role: "user", content: userMessage }];

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
      const toolResult = tool ? await tool.execute(args, toolContext) : "Araç bulunamadı.";
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
