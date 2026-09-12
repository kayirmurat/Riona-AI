import type { ChatMessage, ToolChoice } from "./types";
import { getProvider } from "./provider";
import { getHistory, saveTurn } from "./memory";
import { availableTools, getToolByName } from "./toolRegistry";
import { createPendingAction, getLatestPendingAction, updatePendingActionStatus } from "./approval";
import { touchOrCreateConversation } from "./conversations";
import { getRecentFacts } from "./memoryFacts";

const BASE_SYSTEM_PROMPT =
  "Sen Riona AI'sin, kullanıcının kişisel yapay zeka asistanısın. Gerçekten Gmail ve Google Calendar hesaplarına bağlısın. get_recent_emails, search_emails, get_upcoming_events, create_calendar_event, update_calendar_event, delete_calendar_event, create_email_draft, generate_reply_draft ve get_email_briefing araçlarıyla gerçek işlemler yapabiliyorsun. Kullanıcı takvime bir şey eklemek/değiştirmek/silmek istediğinde ilgili takvim aracını çağır, asla sadece 'tamam eklendi' deme. Kullanıcı 'geçen ay', 'X ay/hafta önce' gibi geçmişe dönük bir mailden bahsettiğinde get_recent_emails yerine search_emails kullan — get_recent_emails sadece en son birkaç maili görür, search_emails Gmail'in kendi arama motoruyla TÜM posta kutusunu tarar. Kullanıcı bir taslak/e-posta/takvimden bahsettiğinde bunu asla sorgulama veya bağlı olmadığını varsayma, doğrudan ilgili aracı çağır. Kullanıcı günlük durumu, bekleyen onayları veya 'mailler nasıl' gibi genel bir şey sorduğunda get_email_briefing aracını kullanarak taranan mailleri ve bekleyen onayları hatırlat. Mailleri özetlerken madde madde liste yapma — kimden geldiğini, ne istediğini/amaçladığını ve aksiyon gerekip gerekmediğini akıcı, anlatı tarzında, kısa bir 'durum özeti' gibi doğal cümlelerle anlat. Kullanıcının farklı bir sohbette (oturumda) söylediği ama burada tekrar etmediği bir tercih/karar sorulursa 'bilmiyorum' deme — aşağıdaki 'Bilinen kalıcı bilgiler' listesine bak, orada varsa onu kullan. Kullanıcı kalıcı olarak hatırlanması gereken bir tercih/karar belirttiğinde remember_fact aracını çağır. Tarih/saat hakkında SADECE aşağıda verilen gerçek güncel tarihe ve araçların (tool) döndürdüğü gerçek verilere güven — kendi tahminine veya eğitim verindeki bir tarihe asla güvenme. Bir bilgiyi (tarih, mail içeriği, vb.) yanlış söylediğini kullanıcı düzeltirse, düzeltmeyi kabul et ve varsa ilgili aracı tekrar çağırıp doğru bilgiyi teyit et; 'emekli bir yapay zeka asistanıyım' gibi konuyla alakasız, uydurma bir açıklama/özür üretme. Kısa, net ve yardımsever cevaplar ver.";

function getCurrentDateContext(): string {
  const formatted = new Date().toLocaleString("tr-TR", {
    timeZone: "America/New_York",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Şu an: ${formatted} (kullanıcının saati, ABD Doğu/New York saat dilimi). Kullanıcı "bugün", "yarın", "bu hafta" gibi göreli zaman ifadeleri kullandığında hesabını bu gerçek tarihe göre yap.`;
}

const VOICE_MODE_INSTRUCTION =
  "\n\nŞu an SESLİ SOHBET modundasın — cevabın yüksek sesle okunacak. Kısa, doğal konuşma cümleleri kur; madde işaretli liste, numaralandırma veya markdown biçimlendirme KULLANMA (bunlar sesli okunduğunda anlamsız çıkar). Söylenecek en önemli şeyi 1-3 kısa cümlede ver.";

async function buildSystemPrompt(voiceMode: boolean): Promise<ChatMessage> {
  const facts = await getRecentFacts();
  let base = `${BASE_SYSTEM_PROMPT}\n\n${getCurrentDateContext()}`;
  if (voiceMode) base += VOICE_MODE_INSTRUCTION;
  if (facts.length === 0) return { role: "system", content: base };

  const factsList = facts.map((f) => `- ${f}`).join("\n");
  return {
    role: "system",
    content: `${base}\n\nBilinen kalıcı bilgiler/tercihler (diğer oturumlarda öğrenildi):\n${factsList}`,
  };
}

const MEETING_MENTION_KEYWORDS = ["toplantı", "meeting"];
const SUMMARY_KEYWORDS = ["özet", "summar"];
const BRIEFING_KEYWORDS = ["hatırlat", "brifing", "briefing", "özet", "bekleyen", "durum ne", "ne var", "bugün mail"];
const EMAIL_KEYWORDS = ["mail", "e-posta", "eposta", "gmail", "gelen kutu", "inbox"];
const CALENDAR_KEYWORDS = ["takvim", "calendar", "etkinlik", "toplantı", "randevu"];
const DRAFT_KEYWORDS = ["taslak", "draft"];
const REPLY_TO_EXISTING_KEYWORDS = ["cevap", "yanıt", "gelen mail", "gelen e-posta", "geleni"];
const HISTORICAL_SEARCH_KEYWORDS = ["ay önce", "hafta önce", "yıl önce", "geçen ay", "geçen hafta", "geçen yıl"];
const CALENDAR_DELETE_KEYWORDS = ["sil", "iptal et", "kaldır"];
const CALENDAR_UPDATE_KEYWORDS = ["değiştir", "ertele", "güncelle", "taşı"];
const CALENDAR_CREATE_KEYWORDS = ["ekle", "oluştur", "ayarla", "planla"];

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
  if (DRAFT_KEYWORDS.some((k) => lower.includes(k))) {
    // "cevap taslağı hazırla" gibi mesajlar zaten taranmış bir maile cevap
    // istiyor (generate_reply_draft) — sıfırdan yeni bir mail taslağından
    // (create_email_draft) ayırt etmek gerekiyor.
    if (REPLY_TO_EXISTING_KEYWORDS.some((k) => lower.includes(k))) return "generate_reply_draft";
    return "create_email_draft";
  }
  if (EMAIL_KEYWORDS.some((k) => lower.includes(k))) {
    // "5 ay önce gelen mail" gibi bir istek son birkaç maili değil, Gmail'in
    // tam geçmişini taramayı gerektiriyor.
    if (HISTORICAL_SEARCH_KEYWORDS.some((k) => lower.includes(k))) return "search_emails";
    return "get_recent_emails";
  }
  if (CALENDAR_KEYWORDS.some((k) => lower.includes(k))) {
    // Sadece okuma değil, takvimde yazma/değiştirme/silme isteyen mesajları
    // da ayırt etmek gerekiyor — aksi halde her takvim mesajı salt get_upcoming_events'e düşer.
    if (CALENDAR_DELETE_KEYWORDS.some((k) => lower.includes(k))) return "delete_calendar_event";
    if (CALENDAR_UPDATE_KEYWORDS.some((k) => lower.includes(k))) return "update_calendar_event";
    if (CALENDAR_CREATE_KEYWORDS.some((k) => lower.includes(k))) return "create_calendar_event";
    return "get_upcoming_events";
  }
  return null;
}

const APPROVE_WORDS = ["onaylıyorum", "onayla", "evet yap", "onay", "tamam yap"];
const REJECT_WORDS = ["iptal", "vazgeç", "yapma"];

// Tek bir kullanıcı mesajı, birbirine bağlı birden fazla araç çağrısı
// gerektirebilir ("takvimime bak, sonra X'e mail at" gibi) — eskiden sadece
// İLK araç çağrısı işlenip ikinci adım hiç gerçekleşmiyordu. Şimdi model
// tool_calls döndürdüğü sürece devam eden bir döngü var; MAX_TOOL_STEPS
// sonsuz döngüyü önlemek için makul bir üst sınır.
const MAX_TOOL_STEPS = 5;

export async function askRiona(
  conversationId: string,
  userMessage: string,
  options?: { voiceMode?: boolean }
): Promise<string> {
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
  const systemPrompt = await buildSystemPrompt(Boolean(options?.voiceMode));
  const messages: ChatMessage[] = [systemPrompt, ...history, { role: "user", content: userMessage }];

  const toolDefs = availableTools.map((t) => t.definition);
  const forced = detectForcedTool(userMessage);
  let toolChoice: ToolChoice = forced ? { type: "function", name: forced } : "auto";

  let finalText: string | null = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const response = await provider.chat(messages, toolDefs, toolChoice);
    toolChoice = "auto"; // zorlanan araç seçimi sadece ilk adımda geçerli

    if (!response.tool_calls || response.tool_calls.length === 0) {
      finalText = response.content;
      break;
    }

    const toolCall = response.tool_calls[0];
    const tool = getToolByName(toolCall.name);
    const args = JSON.parse(toolCall.arguments || "{}");

    if (tool && tool.riskLevel !== "low") {
      const description = `${tool.definition.name} çalıştırılmak isteniyor. Parametreler: ${JSON.stringify(args)}`;
      await createPendingAction(conversationId, tool.definition.name, args, description);
      finalText = `Bunu yapmak için onayına ihtiyacım var:\n\n${description}\n\nOnaylıyorsan "onaylıyorum" yaz, istemiyorsan "iptal" yaz.`;
      break;
    }

    const toolResult = tool ? await tool.execute(args, toolContext) : "Araç bulunamadı.";
    messages.push(response, { role: "tool", content: toolResult, tool_call_id: toolCall.id });
  }

  if (finalText === null) {
    // MAX_TOOL_STEPS adımdan sonra hâlâ araç çağırmak istiyorsa, araçsız bir
    // çağrıyla düz metin cevaba zorlanıyor.
    const wrapUp = await provider.chat(messages);
    finalText = wrapUp.content;
  }

  await saveTurn(conversationId, { role: "user", content: userMessage }, { role: "assistant", content: finalText });
  return finalText;
}
