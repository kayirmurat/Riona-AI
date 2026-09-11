import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { registerCalendarWatch } from "../../../../lib/integrations/google/calendarWatch";

// /api/gmail/watch ile birebir aynı desen: hem ilk kayıt için elle tetiklenir
// hem günlük cron tarafından (Calendar watch kanalları ~30 günde düşüyor,
// günlük yenileme rahat bir marj bırakır).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const accounts = await listGoogleAccounts();
  const results: any[] = [];

  for (const acc of accounts) {
    const accessToken = await getValidAccessTokenFor(acc.email);
    if (!accessToken) {
      results.push({ account: acc.label, ok: false, message: "Token alınamadı." });
      continue;
    }
    const result = await registerCalendarWatch(acc.email, acc.label, accessToken);
    results.push({ account: acc.label, ...result });
  }

  return NextResponse.json({ success: true, results });
}

export async function GET(req: Request) {
  return POST(req);
}
