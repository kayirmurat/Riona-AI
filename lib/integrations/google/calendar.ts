import { getValidAccessTokenFor, listGoogleAccounts } from "./tokens";

async function fetchEventsForAccount(identifier: string, maxResults: number): Promise<string> {
  const accessToken = await getValidAccessTokenFor(identifier);
  if (!accessToken) return "Bu hesap bağlı değil.";

  const now = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    now
  )}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  const events = data.items ?? [];

  if (events.length === 0) return "Yaklaşan etkinlik bulunamadı.";

  return events
    .map((e: any) => {
      const start = e.start?.dateTime ?? e.start?.date ?? "Bilinmiyor";
      return `Başlık: ${e.summary ?? "(başlıksız)"}\nZaman: ${start}${
        e.location ? `\nYer: ${e.location}` : ""
      }`;
    })
    .join("\n\n");
}

export async function fetchUpcomingEvents(maxResults = 5, accountIdentifier?: string): Promise<string> {
  if (accountIdentifier) {
    return fetchEventsForAccount(accountIdentifier, maxResults);
  }
  const accounts = await listGoogleAccounts();
  if (accounts.length === 0) return "Hiçbir Google Calendar hesabı bağlı değil.";
  const parts: string[] = [];
  for (const acc of accounts) {
    const text = await fetchEventsForAccount(acc.email, maxResults);
    parts.push(`--- ${acc.label} (${acc.email}) ---\n${text}`);
  }
  return parts.join("\n\n");
}
