import { getValidAccessTokenFor, listGoogleAccounts } from "./tokens";

// Ham ISO zaman damgasını (etkinliğin kendi saat diliminde olabilir) modele
// doğrudan vermek yerine kullanıcının gerçek saat dilimine (ABD Doğu/New York
// — kullanıcı Florida'da yaşıyor) çevirip haftanın günüyle birlikte okunabilir
// bir metne dönüştürüyoruz — canlı testte model ham ISO string'i kendi başına
// yorumlamaya çalışıp yanlış tarih/saat dilimi bilgisi uydurmuştu.
function formatEventTime(start: { dateTime?: string; date?: string } | undefined): string {
  if (!start) return "Bilinmiyor";
  if (start.dateTime) {
    return new Date(start.dateTime).toLocaleString("tr-TR", {
      timeZone: "America/New_York",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " (New York saati)";
  }
  if (start.date) {
    return new Date(start.date).toLocaleDateString("tr-TR", {
      timeZone: "America/New_York",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }) + " (tüm gün)";
  }
  return "Bilinmiyor";
}

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
      const start = formatEventTime(e.start);
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
      // timeZone açıkça veriliyor ki event.start/end saat dilimi ofseti içermeden
      // (düz yerel saat) gelse bile Google, yaz/kış saati (DST) geçişini kendi
      // hesaplasın — modelin ofseti doğru hesaplamasına güvenmek yerine.
      start: { dateTime: event.start, timeZone: "America/New_York" },
      end: { dateTime: event.end, timeZone: "America/New_York" },
    }),
  });

  if (!res.ok) return { ok: false, message: "Takvim etkinliği oluşturulamadı." };
  return { ok: true, message: "Takvime eklendi." };
}

// Sohbette "şu toplantıyı sil/güncelle" dendiğinde etkinliği bulmak için —
// takvim etkinlikleri bizim veritabanımızda saklanmıyor (Mail'in scanned_emails'i
// gibi), her seferinde Google'dan canlı arama yapılıyor. Calendar API'nin
// kendi `q` parametresi başlık/açıklama/yer/katılımcı üzerinde arama yapıyor.
export async function findEventByTitle(
  accountIdentifier: string,
  titleContains: string
): Promise<RawCalendarEvent | null> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return null;

  const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    q: titleContains,
    maxResults: "5",
  });

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = (data.items ?? []) as RawCalendarEvent[];
  return items[0] ?? null;
}

export async function updateCalendarEvent(
  accountIdentifier: string,
  eventId: string,
  changes: { title?: string; start?: string; end?: string; location?: string; description?: string }
): Promise<boolean> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return false;

  const body: Record<string, unknown> = {};
  if (changes.title) body.summary = changes.title;
  if (changes.location) body.location = changes.location;
  if (changes.description) body.description = changes.description;
  if (changes.start) body.start = { dateTime: changes.start, timeZone: "America/New_York" };
  if (changes.end) body.end = { dateTime: changes.end, timeZone: "America/New_York" };

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function deleteCalendarEvent(accountIdentifier: string, eventId: string): Promise<boolean> {
  const accessToken = await getValidAccessTokenFor(accountIdentifier);
  if (!accessToken) return false;

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 410 (Gone) etkinlik zaten silinmiş demektir — kullanıcı açısından yine de başarı.
  return res.ok || res.status === 410;
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
