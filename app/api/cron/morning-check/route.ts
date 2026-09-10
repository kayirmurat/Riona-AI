import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { classifyAndStoreEmail } from "../../../../lib/ai/mailProcessing";

const MAX_EMAILS_PER_ACCOUNT = 10;

// Artık gerçek zamanlı taramanın (webhook: /api/webhooks/gmail) bir yedek/backstop'u.
// Watch/webhook bir şekilde sessizce arızalanırsa diye haftalık olarak (vercel.json)
// aynı taramayı tekrar yapar; sınıflandırma mantığı lib/ai/mailProcessing.ts'te ortak.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  try {
    const accounts = await listGoogleAccounts();
    const debug: any[] = [];
    let scannedCount = 0;

    for (const acc of accounts) {
      const accessToken = await getValidAccessTokenFor(acc.email);
      if (!accessToken) {
        debug.push({ account: acc.label, error: "Token alınamadı" });
        continue;
      }

      const query = encodeURIComponent("in:inbox category:primary");
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_EMAILS_PER_ACCOUNT}&q=${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();

      if (!listRes.ok) {
        debug.push({ account: acc.label, gmailError: listData });
        continue;
      }

      const messages: { id: string }[] = listData.messages ?? [];
      let newCount = 0;

      for (const m of messages) {
        const result = await classifyAndStoreEmail(acc, m.id, accessToken);
        if (result === "inserted") newCount++;
      }

      debug.push({ account: acc.label, foundMessages: messages.length, newlyScanned: newCount });
      scannedCount += newCount;
    }

    return NextResponse.json({ success: true, scanned: scannedCount, debug });
  } catch (err: any) {
    console.error("[morning-check] taramada beklenmeyen hata:", err);
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
