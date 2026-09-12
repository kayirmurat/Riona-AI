import { supabase } from "../db/supabase";
import { getProvider } from "./provider";
import { createPendingAction } from "./approval";
import { createCalendarNote } from "../integrations/google/calendar";
import { extractEmailBody, extractAttachments } from "../integrations/google/gmail";
import { getValidAccessTokenFor } from "../integrations/google/tokens";
import { sendPushToAll } from "../push/sendPush";

const MAX_BODY_CHARS_FOR_AI = 6000;

const NO_REPLY_PATTERN = /no-?reply|notification|noreply/i;
const AUTO_NOTIFICATION_CATEGORY = "Otomatik Bildirim";
const MAX_EXISTING_CATEGORIES = 30;

interface Classification {
  needs_reply: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  is_meeting: boolean;
  meeting_title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  meeting_location: string | null;
  category: string | null;
}

const CLASSIFICATION_FALLBACK: Classification = {
  needs_reply: false,
  draft_subject: null,
  draft_body: null,
  is_meeting: false,
  meeting_title: null,
  meeting_start: null,
  meeting_end: null,
  meeting_location: null,
  category: null,
};

// Kategori isimlerinin çoğalmasını önlemek için (örn. "Fatura" ve
// "Faturalandırma" ayrı ayrı üretilmesin) modele daha önce üretilmiş
// kategorilerin bir listesi context olarak veriliyor.
async function getExistingCategories(): Promise<string[]> {
  const { data } = await supabase
    .from("scanned_emails")
    .select("category")
    .not("category", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!data) return [];
  const unique = Array.from(new Set(data.map((row: any) => row.category as string)));
  return unique.slice(0, MAX_EXISTING_CATEGORIES);
}

export async function classifyEmail(from: string, subject: string, snippet: string, body?: string): Promise<Classification> {
  const currentYear = new Date().getFullYear();
  // Gmail'in snippet'i sadece kısa bir önizleme — tam gövde varsa onu kullanıyoruz,
  // taslak cevabın gerçek içeriğe göre yazılabilmesi için.
  const content = body && body.trim() ? body.trim().slice(0, MAX_BODY_CHARS_FOR_AI) : snippet;
  const existingCategories = await getExistingCategories();
  const categoriesHint =
    existingCategories.length > 0
      ? `Kullanıcının daha önce kullanılan kategori isimleri: ${JSON.stringify(existingCategories)}. Anlamca uyan bir kategori bu listede VARSA onu birebir aynı şekilde kullan, yoksa kısa ve anlamlı yeni bir tane üret.`
      : "Henüz kategori geçmişi yok, kısa ve anlamlı yeni bir kategori üret.";

  try {
    const provider = getProvider();
    const response = await provider.chat(
      [
        {
          role: "system",
          content: `Bir e-postayı değerlendir ve SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"needs_reply": boolean, "draft_subject": string|null, "draft_body": string|null, "is_meeting": boolean, "meeting_title": string|null, "meeting_start": string|null, "meeting_end": string|null, "meeting_location": string|null, "category": string}

Kurallar:
- needs_reply: kullanıcının kişisel olarak cevap yazması gerekiyorsa true; bilgilendirme, fatura, bülten, otomatik bildirim veya promosyonsa false.
- needs_reply true ise draft_subject ve draft_body kısa ve profesyonel bir taslakla doldurulsun, değilse ikisi de null olsun.
- is_meeting: e-posta bir toplantı/randevu daveti içeriyorsa veya belirli bir toplantı zamanından bahsediyorsa true.
- is_meeting true ise meeting_title, meeting_start ve meeting_end ISO 8601 formatında, saat dilimi ofseti EKLEMEDEN düz yerel saat olarak (örn. "2026-09-19T14:00:00", sonunda Z veya +/-saat farkı olmadan — kullanıcının gerçek saat dilimi ABD Doğu/New York, bu ayrıca ayarlanıyor) doldurulsun (yıl belirtilmemişse ${currentYear} varsay), meeting_location (yoksa null) doldurulsun. Bitiş saati belirtilmemişse başlangıçtan 1 saat sonrası olsun.
- Zamanı makul şekilde tahmin edemiyorsan is_meeting false yap.
- category: e-postanın konusuna en uygun KISA (1-3 kelime) bir kategori adı (örn. "Faturalandırma", "Franchise Operasyonları", "Randevu/Toplantı", "Kişisel"). Sabit bir liste yok, içeriğe göre sen üret. ${categoriesHint}`,
        },
        { role: "user", content: `Kimden: ${from}\nKonu: ${subject}\nİçerik: ${content}` },
      ],
      undefined,
      undefined,
      { type: "json_object" }
    );

    const parsed = JSON.parse(response.content || "{}");
    return {
      needs_reply: Boolean(parsed.needs_reply),
      draft_subject: parsed.draft_subject ?? null,
      draft_body: parsed.draft_body ?? null,
      is_meeting: Boolean(parsed.is_meeting),
      meeting_title: parsed.meeting_title ?? null,
      meeting_start: parsed.meeting_start ?? null,
      meeting_end: parsed.meeting_end ?? null,
      meeting_location: parsed.meeting_location ?? null,
      category: typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim() : null,
    };
  } catch (err) {
    console.error("[mailProcessing] classifyEmail hatası, needs_reply=false döndürülüyor:", err);
    return CLASSIFICATION_FALLBACK;
  }
}

interface Account {
  email: string;
  label: string;
}

export type ProcessResult = "inserted" | "already_scanned" | "fetch_failed";

// Tek bir Gmail mesajını tarar: zaten taranmışsa atlar, no-reply/bildirim
// gönderenleri sınıflandırmadan "info" olarak kaydeder, aksi halde AI ile
// sınıflandırıp gerekirse taslak onay kuyruğuna ve toplantıysa takvime ekler.
// Hem günlük yedek taramadan hem de gerçek zamanlı webhook'tan çağrılır.
export async function classifyAndStoreEmail(account: Account, messageId: string, accessToken: string): Promise<ProcessResult> {
  const { data: existingRow } = await supabase
    .from("scanned_emails")
    .select("id")
    .eq("gmail_message_id", messageId)
    .eq("account_label", account.label)
    .maybeSingle();
  if (existingRow) return "already_scanned";

  // Gmail push bildirimi geldikten hemen sonra mesaj bazen henüz tam olarak
  // sorgulanabilir olmuyor (kısa bir tutarlılık gecikmesi) — 404 alınırsa
  // birkaç kez, artan aralıklarla tekrar denenir.
  const RETRY_DELAYS_MS = [1000, 2000, 3000];
  let msgRes: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (msgRes.ok || msgRes.status !== 404 || attempt === RETRY_DELAYS_MS.length) break;
    console.log(`[mailProcessing] mesaj henüz hazır değil (404), tekrar denenecek: account=${account.label} message=${messageId} attempt=${attempt + 1}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
  if (!msgRes || !msgRes.ok) {
    const errorBody = msgRes ? await msgRes.text().catch(() => "") : "";
    console.error(`[mailProcessing] mesaj alınamadı: account=${account.label} message=${messageId} status=${msgRes?.status} body=${errorBody}`);
    return "fetch_failed";
  }
  const msgData = await msgRes.json();
  const headers = msgData.payload?.headers ?? [];
  const from = headers.find((h: any) => h.name === "From")?.value ?? "";
  const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
  const snippet = msgData.snippet ?? "";
  const bodyText = extractEmailBody(msgData.payload);
  const messageIdHeader = headers.find((h: any) => h.name === "Message-ID" || h.name === "Message-Id")?.value ?? null;
  const gmailThreadId: string | null = msgData.threadId ?? null;
  const ccHeader = headers.find((h: any) => h.name === "Cc" || h.name === "CC")?.value ?? null;
  const attachments = extractAttachments(msgData.payload);

  if (NO_REPLY_PATTERN.test(from)) {
    // Aynı message id'nin iki tetikleyiciden (cron + webhook) neredeyse aynı anda
    // gelmesi durumunda ikisinin de bu insert'e ulaşmasını engellemek için
    // scanned_emails(gmail_message_id, account_label) üzerindeki unique kısıt
    // ikinci denemeyi veritabanı seviyesinde reddeder; bu beklenen ve zararsızdır.
    const { error } = await supabase.from("scanned_emails").insert({
      gmail_message_id: messageId,
      account_label: account.label,
      from_address: from,
      subject,
      snippet,
      body_text: bodyText || null,
      cc: ccHeader,
      attachments: attachments.length > 0 ? attachments : null,
      needs_reply: false,
      status: "info",
      category: AUTO_NOTIFICATION_CATEGORY,
    });
    if (error) {
      console.error(`[mailProcessing] insert hatası (no-reply): account=${account.label} message=${messageId}`, error);
      return "already_scanned";
    }
    return "inserted";
  }

  const classification = await classifyEmail(from, subject, snippet, bodyText);

  let pendingActionId: string | null = null;
  let draftSubject: string | null = null;
  let draftBody: string | null = null;

  if (classification.needs_reply) {
    draftSubject = classification.draft_subject ?? `Re: ${subject}`;
    draftBody = classification.draft_body ?? "";
    const replyTo = from.match(/<(.+)>/)?.[1] ?? from;

    pendingActionId = await createPendingAction(
      "system-automation",
      "create_email_draft",
      {
        to: replyTo,
        subject: draftSubject,
        body: draftBody,
        account: account.label,
        thread_id: gmailThreadId,
        in_reply_to: messageIdHeader,
        cc: ccHeader,
        bcc: null,
      },
      `"${subject}" konulu maile öneri cevap (${account.label})`
    );

    // "Önemli" ayrı bir skor değil, needs_reply ile aynı sinyal — kullanıcının
    // gerçekten dikkat etmesi gereken mailler zaten cevap gerektirenler.
    sendPushToAll({
      title: "Cevap bekleyen yeni mail",
      body: `"${subject}" — ${from}`,
      url: "/",
    }).catch((err) => console.error("[mailProcessing] push bildirimi gönderilemedi:", err));
  }

  if (classification.is_meeting && classification.meeting_title && classification.meeting_start && classification.meeting_end) {
    const calendarResult = await createCalendarNote(account.email, {
      title: classification.meeting_title,
      start: classification.meeting_start,
      end: classification.meeting_end,
      location: classification.meeting_location,
      description: `Kaynak e-posta: "${subject}" (${from})\nMaili aç: https://mail.google.com/mail/u/0/#all/${messageId}`,
    });
    if (!calendarResult.ok) {
      console.error(`[mailProcessing] takvim notu oluşturulamadı: account=${account.label} message=${messageId}`, calendarResult.message);
    }
  }

  const { error } = await supabase.from("scanned_emails").insert({
    gmail_message_id: messageId,
    account_label: account.label,
    from_address: from,
    subject,
    snippet,
    body_text: bodyText || null,
    cc: ccHeader,
    attachments: attachments.length > 0 ? attachments : null,
    needs_reply: classification.needs_reply,
    draft_subject: draftSubject,
    draft_body: draftBody,
    pending_action_id: pendingActionId,
    status: classification.needs_reply ? "pending" : "info",
    category: classification.category,
  });
  if (error) {
    console.error(`[mailProcessing] insert hatası: account=${account.label} message=${messageId}`, error);
    return "already_scanned";
  }
  console.log(`[mailProcessing] kaydedildi: account=${account.label} message=${messageId} subject="${subject}" needs_reply=${classification.needs_reply}`);
  return "inserted";
}

async function generateReplyDraft(from: string, subject: string, content: string): Promise<{ subject: string; body: string }> {
  const provider = getProvider();
  const response = await provider.chat(
    [
      {
        role: "system",
        content: `Kullanıcı, AI tarafından "cevap gerektirmiyor" diye sınıflandırılmış bir e-postaya yine de elle bir cevap taslağı hazırlanmasını istedi. SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"subject": string, "body": string}
Kısa, profesyonel bir cevap taslağı yaz. Konu satırı "Re: " ile başlasın.`,
      },
      { role: "user", content: `Kimden: ${from}\nKonu: ${subject}\nİçerik: ${content}` },
    ],
    undefined,
    undefined,
    { type: "json_object" }
  );

  const parsed = JSON.parse(response.content || "{}");
  return {
    subject: typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim() : `Re: ${subject}`,
    body: typeof parsed.body === "string" ? parsed.body.trim() : "",
  };
}

// Bilgilendirme amaçlı ("cevap gerektirmiyor") sınıflandırılan bir maile
// kullanıcı sonradan yine de cevap yazmak isteyebilir — AI'ın needs_reply
// kararı kesin değil, kullanıcının kendi kararı üstün. Bu, o mail için
// isteğe bağlı olarak sonradan bir taslak üretip onay kuyruğuna sokar.
export async function generateDraftForEmail(emailId: string): Promise<{ success: boolean; error?: string }> {
  const { data: email } = await supabase.from("scanned_emails").select("*").eq("id", emailId).maybeSingle();
  if (!email) return { success: false, error: "Mail bulunamadı." };
  if (email.pending_action_id) return { success: false, error: "Bu mail için zaten bir taslak/aksiyon var." };

  const { data: account } = await supabase
    .from("google_accounts")
    .select("email, label")
    .eq("label", email.account_label)
    .maybeSingle();
  if (!account) return { success: false, error: "Hesap bulunamadı." };

  const accessToken = await getValidAccessTokenFor(account.email);
  if (!accessToken) return { success: false, error: "Hesap bağlı değil." };

  // Thread/Message-ID bilgisi tarama sırasında sadece needs_reply=true olan
  // mailler için saklanıyor (pending_actions.arguments içinde) — bilgilendirme
  // mailleri için burada tekrar Gmail'den çekiliyor.
  let gmailThreadId: string | null = null;
  let messageIdHeader: string | null = null;
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.gmail_message_id}?format=metadata&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (msgRes.ok) {
    const msgData = await msgRes.json();
    gmailThreadId = msgData.threadId ?? null;
    const headers = msgData.payload?.headers ?? [];
    messageIdHeader = headers.find((h: any) => h.name === "Message-ID" || h.name === "Message-Id")?.value ?? null;
  }

  const content = (email.body_text?.trim() || email.snippet || "") as string;
  const draft = await generateReplyDraft(email.from_address, email.subject, content);
  const replyTo = (email.from_address as string).match(/<(.+)>/)?.[1] ?? email.from_address;

  const pendingActionId = await createPendingAction(
    "system-automation",
    "create_email_draft",
    {
      to: replyTo,
      subject: draft.subject,
      body: draft.body,
      account: email.account_label,
      thread_id: gmailThreadId,
      in_reply_to: messageIdHeader,
      cc: email.cc,
      bcc: null,
    },
    `"${email.subject}" konulu maile öneri cevap (${email.account_label})`
  );

  await supabase
    .from("scanned_emails")
    .update({
      needs_reply: true,
      draft_subject: draft.subject,
      draft_body: draft.body,
      pending_action_id: pendingActionId,
      status: "pending",
    })
    .eq("id", emailId);

  return { success: true };
}
