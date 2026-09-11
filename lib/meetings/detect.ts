import { supabase } from "../db/supabase";
import { listGoogleAccounts } from "../integrations/google/tokens";
import { fetchRawUpcomingEventItems, type RawCalendarEvent } from "../integrations/google/calendar";

const SCAN_WINDOW_DAYS = 30;
const MAX_EVENTS_PER_ACCOUNT = 50;

const PLATFORM_PATTERNS: { platform: string; pattern: RegExp }[] = [
  { platform: "google_meet", pattern: /meet\.google\.com\/[a-z0-9-]+/i },
  { platform: "zoom", pattern: /[a-z0-9.-]*zoom\.us\/[^\s"'<>]+/i },
  { platform: "teams", pattern: /teams\.microsoft\.com\/[^\s"'<>]+/i },
];

interface DetectedMeeting {
  url: string;
  platform: string;
}

export function detectMeetingLink(event: RawCalendarEvent): DetectedMeeting | null {
  // Google Meet için Calendar'ın kendi verdiği kesin alan — regex'ten daha güvenilir.
  if (event.hangoutLink) {
    return { url: event.hangoutLink, platform: "google_meet" };
  }

  const haystack = [
    event.location ?? "",
    event.description ?? "",
    ...(event.conferenceData?.entryPoints ?? []).map((e) => e.uri ?? ""),
  ].join("\n");

  for (const { platform, pattern } of PLATFORM_PATTERNS) {
    const match = haystack.match(pattern);
    if (match) return { url: match[0], platform };
  }
  return null;
}

interface Account {
  email: string;
  label: string;
}

// Tek bir event'i tespit edip upsert eder — hem tam tarama (scanAndUpsertMeetings)
// hem Calendar push webhook'unun artımlı yolu bunu paylaşıyor, kopya mantık olmasın diye.
export async function upsertMeetingFromEvent(event: RawCalendarEvent, account: Account): Promise<boolean> {
  const detected = detectMeetingLink(event);
  if (!detected) return false;

  const startsAt = event.start?.dateTime ?? event.start?.date;
  if (!startsAt) return false;

  const { error } = await supabase.from("meetings").upsert(
    {
      calendar_event_id: event.id,
      account_email: account.email,
      account_label: account.label,
      calendar_event_link: event.htmlLink ?? null,
      meeting_url: detected.url,
      platform: detected.platform,
      title: event.summary ?? null,
      starts_at: startsAt,
      ends_at: event.end?.dateTime ?? event.end?.date ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "calendar_event_id,account_label" }
  );

  if (error) {
    console.error(`[meetings/detect] upsert hatası: event=${event.id} account=${account.email} error=${error.message}`);
    return false;
  }
  return true;
}

export async function scanAndUpsertMeetings(): Promise<{ scanned: number; upserted: number }> {
  const accounts = await listGoogleAccounts();
  const now = new Date();
  const timeMinISO = now.toISOString();
  const timeMaxISO = new Date(now.getTime() + SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let scanned = 0;
  let upserted = 0;

  for (const account of accounts) {
    const events = await fetchRawUpcomingEventItems(account.email, {
      timeMinISO,
      timeMaxISO,
      maxResults: MAX_EVENTS_PER_ACCOUNT,
    });
    scanned += events.length;

    for (const event of events) {
      if (await upsertMeetingFromEvent(event, account)) upserted++;
    }
  }

  return { scanned, upserted };
}
