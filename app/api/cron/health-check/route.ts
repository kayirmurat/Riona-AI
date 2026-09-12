import { NextResponse } from "next/server";
import { checkPipelineHealth } from "../../../../lib/health/pipelineHealth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  try {
    const result = await checkPipelineHealth();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[health-check] beklenmeyen hata:", err);
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
