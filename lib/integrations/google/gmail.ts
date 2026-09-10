import { getValidAccessTokenFor, listGoogleAccounts } from "./tokens";

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

function buildEncodedMessage(to: string, subject: string, body: string): string {
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf-8").toString("base64"),
  ].join("\n");

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
  body: string
): Promise<string> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return "Bu hesap bağlı değil.";

  const encodedMessage = buildEncodedMessage(to, subject, body);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw: encodedMessage } }),
  });

  if (!res.ok) return "Taslak oluşturulamadı.";
  return "Taslak başarıyla Gmail'de oluşturuldu (Taslaklar klasörüne bak).";
}

export async function sendEmail(accountIdentifier: string, to: string, subject: string, body: string): Promise<string> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return "Bu hesap bağlı değil.";

  const encodedMessage = buildEncodedMessage(to, subject, body);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!res.ok) return "Mail gönderilemedi.";
  return "Mail başarıyla gönderildi.";
}
