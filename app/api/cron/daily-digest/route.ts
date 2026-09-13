import { NextResponse } from "next/server";
import { buildAndSendDailyDigest } from "../../../../lib/ai/dailyDigest";
import { getHourIn, claimDailyRun } from "../../../../lib/cron/localHour";

const TIMEZONE = "America/New_York";
const TARGET_HOUR = 9;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  if (getHourIn(TIMEZONE) !== TARGET_HOUR) {
    return NextResponse.json({ success: true, skipped: true, reason: "hedef saat değil" });
  }
  if (!(await claimDailyRun("daily-digest", TIMEZONE))) {
    return NextResponse.json({ success: true, skipped: true, reason: "bugün zaten çalıştı" });
  }

  try {
    const result = await buildAndSendDailyDigest();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[daily-digest] beklenmeyen hata:", err);
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
