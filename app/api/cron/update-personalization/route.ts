import { NextResponse } from "next/server";
import { updatePersonalizationProfile } from "../../../../lib/ai/personalization";
import { getHourIn, claimDailyRun } from "../../../../lib/cron/localHour";

// Diğer günlük cron'larla (daily-digest, health-check, daily-conversation)
// aynı DST-güvenli desen: Vercel Hobby planı günde birden fazla
// çalıştıramadığı ve saat dilimi bilmediği için GitHub Actions saatlik
// tetikliyor, burada gerçek New York saati kontrol ediliyor.
const TIMEZONE = "America/New_York";
const TARGET_HOUR = 3;

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
  if (!(await claimDailyRun("update-personalization", TIMEZONE))) {
    return NextResponse.json({ success: true, skipped: true, reason: "bugün zaten çalıştı" });
  }

  try {
    const result = await updatePersonalizationProfile();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[update-personalization] beklenmeyen hata:", err);
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
