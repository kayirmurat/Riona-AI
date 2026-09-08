import { getValidAccessToken } from "./tokens";

export async function fetchRecentEmails(maxResults = 5): Promise<string> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return "Gmail hesabı henüz bağlı değil.";
  }

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
