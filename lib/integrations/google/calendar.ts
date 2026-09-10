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

interface MeetingEvent {
  title: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string;
}

export async function createCalendarNote(
  accountIdentifier: string,
  event: MeetingEvent
): Promise<{ ok: boolean; message: string }> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return { ok: false, message: "Bu hesap bağlı değil." };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: event.title,
      location: event.location ?? undefined,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
    }),
  });

  if (!res.ok) return { ok: false, message: "Takvim etkinliği oluşturulamadı." };
  return { ok: true, message: "Takvime eklendi." };
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
