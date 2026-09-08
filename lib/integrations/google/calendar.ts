import { getValidAccessToken } from "./tokens";

export async function fetchUpcomingEvents(maxResults = 5): Promise<string> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return "Google Calendar hesabı henüz bağlı değil.";
  }

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
