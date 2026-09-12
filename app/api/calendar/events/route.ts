import { NextResponse } from "next/server";
import { listGoogleAccounts } from "../../../../lib/integrations/google/tokens";
import { fetchRawUpcomingEventItems } from "../../../../lib/integrations/google/calendar";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const MAX_EVENTS_PER_ACCOUNT = 50;

export async function GET() {
  const accounts = await listGoogleAccounts();
  const now = new Date();
  const timeMinISO = now.toISOString();
  const timeMaxISO = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const events: any[] = [];
  for (const account of accounts) {
    const items = await fetchRawUpcomingEventItems(account.email, {
      timeMinISO,
      timeMaxISO,
      maxResults: MAX_EVENTS_PER_ACCOUNT,
    });
    for (const item of items) {
      events.push({
        id: item.id,
        account_label: account.label,
        title: item.summary ?? null,
        start: item.start?.dateTime ?? item.start?.date ?? null,
        end: item.end?.dateTime ?? item.end?.date ?? null,
        location: item.location ?? null,
        html_link: item.htmlLink ?? null,
        hangout_link: item.hangoutLink ?? null,
      });
    }
  }

  events.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

  return NextResponse.json({ events });
}
