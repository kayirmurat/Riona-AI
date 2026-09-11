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

export interface RawCalendarEvent {
  id: string;
  summary?: string;
  location?: string;
  description?: string;
  hangoutLink?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: { entryPoints?: { uri?: string }[] };
}

// classifyEmail benzeri ham veri ihtiyaçları için: fetchEventsForAccount chat'e
// göstermek üzere formatlı string döndürüyor, toplantı linki taraması gibi
// programatik kullanımlar için ham event JSON'ı gerekiyor.
export async function fetchRawUpcomingEventItems(
  accountIdentifier: string,
  opts: { timeMinISO: string; timeMaxISO: string; maxResults: number }
): Promise<RawCalendarEvent[]> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return [];

  const params = new URLSearchParams({
    timeMin: opts.timeMinISO,
    timeMax: opts.timeMaxISO,
    maxResults: String(opts.maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.error(`[calendar] fetchRawUpcomingEventItems hatası: identifier=${accountIdentifier} status=${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.items ?? []) as RawCalendarEvent[];
}

// Watch kanalı ilk kurulduğunda bir başlangıç syncToken'ı gerekiyor — bunu almanın
// yolu, zaman filtresi olmadan tam bir events.list turu yapıp son sayfadaki
// nextSyncToken'ı okumak. Kişisel takvim ölçeğinde (binlerce etkinlik değil) tek
// sayfa yeterli; maxResults 2500 (Calendar API'nin izin verdiği üst sınır).
export async function fetchInitialSyncToken(accountIdentifier: string): Promise<string | null> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return null;

  const params = new URLSearchParams({ singleEvents: "true", maxResults: "2500" });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.error(`[calendar] fetchInitialSyncToken hatası: identifier=${accountIdentifier} status=${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.nextSyncToken ?? null;
}

type EventsSinceResult =
  | { ok: true; events: RawCalendarEvent[]; newSyncToken: string }
  | { ok: false; reason: "sync_token_invalid" | "error" };

// Calendar push webhook'unun artımlı yolu için: syncToken varken timeMin/timeMax
// gönderilemiyor (Calendar API kısıtı), syncToken tek başına son senkronizasyondan
// beri değişen (silinenler dahil) her şeyi döner. Gmail'in history.list'ine benzer.
export async function fetchEventsSince(
  accountIdentifier: string,
  syncToken: string
): Promise<EventsSinceResult> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return { ok: false, reason: "error" };

  const params = new URLSearchParams({ syncToken, singleEvents: "true" });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 410) {
    // syncToken artık geçersiz (çok eski/geçersiz) — çağıran taraf tam taramaya düşmeli.
    return { ok: false, reason: "sync_token_invalid" };
  }
  if (!res.ok) {
    console.error(`[calendar] fetchEventsSince hatası: identifier=${accountIdentifier} status=${res.status}`);
    return { ok: false, reason: "error" };
  }

  const data = await res.json();
  return {
    ok: true,
    events: (data.items ?? []) as RawCalendarEvent[],
    newSyncToken: String(data.nextSyncToken ?? syncToken),
  };
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
