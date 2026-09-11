import { NextResponse } from "next/server";
import { scanAndUpsertMeetings } from "../../../../lib/meetings/detect";

// Meeting BaaS hesabı kurulmadan önce de bağımsız test edilebilsin diye ayrı bir
// endpoint: sadece tespit + upsert yapar, bot dispatch mantığı Stage 2'de
// dispatch route'una eklenir (o da önce bunu çağırır).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const result = await scanAndUpsertMeetings();
  return NextResponse.json({ success: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
