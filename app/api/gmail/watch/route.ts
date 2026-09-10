import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { registerWatch } from "../../../../lib/integrations/google/watch";

// Hem ilk kayıt için elle tetiklenir hem de günlük cron tarafından çağrılır
// (Gmail watch kaydı 7 günde bir düşüyor, günlük yenileme rahat bir marj bırakır).
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
    const result = await registerWatch(acc.email, acc.label, accessToken);
    results.push({ account: acc.label, ...result });
  }

  return NextResponse.json({ success: true, results });
}

export async function GET(req: Request) {
  return POST(req);
}
