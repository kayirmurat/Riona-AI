import { NextResponse } from "next/server";
import { scanAndUpsertMeetings } from "../../../../lib/meetings/detect";
import { dispatchDueBots } from "../../../../lib/meetings/dispatch";

// Vercel Hobby planı cron'ları günde bir defadan sık çalıştıramadığı için bu
// endpoint Vercel cron yerine .github/workflows/meeting-dispatch.yml'deki
// GitHub Actions zamanlanmış görevi tarafından her birkaç dakikada bir tetikleniyor.
// Önce tespiti tazeler, sonra saati gelen toplantılar için bot gönderir — tek
// dış tetikleyici, tek endpoint.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const scanResult = await scanAndUpsertMeetings();
  const dispatchResult = await dispatchDueBots();

  return NextResponse.json({ success: true, scan: scanResult, dispatch: dispatchResult });
}

export async function GET(req: Request) {
  return POST(req);
}
