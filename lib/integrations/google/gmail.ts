import { getValidAccessTokenFor, listGoogleAccounts } from "./tokens";

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailMessagePart[];
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBodyPart(part: GmailMessagePart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findBodyPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

// Gmail'in "snippet" alanı sadece kısa bir önizleme (~100-200 karakter) —
// hem AI sınıflandırmasının hem panelin gerçek mail içeriğini görebilmesi
// için tam gövdeyi ayrıştırıyoruz. text/plain varsa onu tercih ediyoruz
// (HTML'den ayrıştırma gürültülü olabilir), yoksa HTML'i basitçe düz metne
// çeviriyoruz.
export function extractEmailBody(payload: unknown): string {
  const p = payload as GmailMessagePart | undefined;
  if (!p) return "";
  const plain = findBodyPart(p, "text/plain");
  if (plain) return plain.trim();
  const html = findBodyPart(p, "text/html");
  if (html) return stripHtml(html);
  if (p.body?.data) return decodeBase64Url(p.body.data).trim();
  return "";
}

// Ekleri okumak için: dosya adı VE attachmentId'si olan parçalar gerçek ek
// dosyalardır (gövde parçalarında filename olmuyor). İçerikleri burada
// indirilmiyor — sadece metadata, gerçek indirme ayrı bir uç noktada
// (kullanıcı tıkladığında) yapılıyor, DB'yi büyütmemek için.
function collectAttachments(part: GmailMessagePart, out: EmailAttachment[]): void {
  if (part.filename && part.body?.attachmentId) {
    out.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      attachmentId: part.body.attachmentId,
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) {
    collectAttachments(child, out);
  }
}

export function extractAttachments(payload: unknown): EmailAttachment[] {
  const p = payload as GmailMessagePart | undefined;
  if (!p) return [];
  const out: EmailAttachment[] = [];
  collectAttachments(p, out);
  return out;
}

export async function fetchAttachmentData(
  accountIdentifier: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return null;

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.data) return null;
  return Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function fetchEmailsForAccount(identifier: string, maxResults: number): Promise<string> {
  const accessToken = await getValidAccessTokenFor(identifier);
  if (!accessToken) return "Bu hesap bağlı değil.";

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  const ids: string[] = (listData.messages ?? []).map((m: any) => m.id);

  const summaries: string[] = [];
  for (const id of ids) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msgData = await msgRes.json();
    const headers = msgData.payload?.headers ?? [];
    const from = headers.find((h: any) => h.name === "From")?.value ?? "Bilinmiyor";
    const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "(konu yok)";
    const snippet = msgData.snippet ?? "";
    summaries.push(`Kimden: ${from}\nKonu: ${subject}\nÖzet: ${snippet}`);
  }

  return summaries.length > 0 ? summaries.join("\n\n") : "Gelen kutusunda mesaj bulunamadı.";
}

export async function fetchRecentEmails(maxResults = 5, accountIdentifier?: string): Promise<string> {
  if (accountIdentifier) {
    return fetchEmailsForAccount(accountIdentifier, maxResults);
  }
  const accounts = await listGoogleAccounts();
  if (accounts.length === 0) return "Hiçbir Gmail hesabı bağlı değil.";
  const parts: string[] = [];
  for (const acc of accounts) {
    const text = await fetchEmailsForAccount(acc.email, maxResults);
    parts.push(`--- ${acc.label} (${acc.email}) ---\n${text}`);
  }
  return parts.join("\n\n");
}

function encodeSubject(subject: string): string {
  const base64Subject = Buffer.from(subject, "utf-8").toString("base64");
  return `=?UTF-8?B?${base64Subject}?=`;
}

export interface ThreadContext {
  threadId?: string | null;
  inReplyTo?: string | null;
  cc?: string | null;
  bcc?: string | null;
}

// threadId tek başına yeterli değil — Gmail bir mesajı var olan bir zincire ancak
// In-Reply-To/References header'ları o zincirdeki bir mesajın Message-ID'sine
// eşleştiğinde ekliyor. İkisi birlikte verilmezse cevap, alıcının kutusunda
// orijinal yazışmadan ayrı, yeni bir konuşma olarak görünüyordu.
function buildEncodedMessage(to: string, subject: string, body: string, ctx?: ThreadContext): string {
  const headerLines = [`To: ${to}`];
  if (ctx?.cc) headerLines.push(`Cc: ${ctx.cc}`);
  if (ctx?.bcc) headerLines.push(`Bcc: ${ctx.bcc}`);
  headerLines.push(`Subject: ${encodeSubject(subject)}`);
  if (ctx?.inReplyTo) {
    headerLines.push(`In-Reply-To: ${ctx.inReplyTo}`);
    headerLines.push(`References: ${ctx.inReplyTo}`);
  }
  headerLines.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "");

  const rawMessage = [...headerLines, Buffer.from(body, "utf-8").toString("base64")].join("\n");

  return Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createEmailDraft(
  accountIdentifier: string,
  to: string,
  subject: string,
  body: string,
  ctx?: ThreadContext
): Promise<string> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return "Bu hesap bağlı değil.";

  const encodedMessage = buildEncodedMessage(to, subject, body, ctx);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw: encodedMessage, threadId: ctx?.threadId ?? undefined } }),
  });

  if (!res.ok) return "Taslak oluşturulamadı.";
  return "Taslak başarıyla Gmail'de oluşturuldu (Taslaklar klasörüne bak).";
}

export async function sendEmail(
  accountIdentifier: string,
  to: string,
  subject: string,
  body: string,
  ctx?: ThreadContext
): Promise<string> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return "Bu hesap bağlı değil.";

  const encodedMessage = buildEncodedMessage(to, subject, body, ctx);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodedMessage, threadId: ctx?.threadId ?? undefined }),
  });

  if (!res.ok) return "Mail gönderilemedi.";
  return "Mail başarıyla gönderildi.";
}

export async function archiveEmail(accountIdentifier: string, messageId: string): Promise<boolean> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return false;

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
  });
  return res.ok;
}

export async function trashEmail(accountIdentifier: string, messageId: string): Promise<boolean> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return false;

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

export async function markEmailRead(accountIdentifier: string, messageId: string): Promise<boolean> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return false;

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  return res.ok;
}
