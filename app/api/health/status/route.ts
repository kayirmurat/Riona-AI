import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";

export const dynamic = "force-dynamic";

const CRON_KEYS = ["daily-digest", "health-check", "daily-conversation"] as const;

export async function GET() {
  const [resultRes, cronRes] = await Promise.all([
    supabase.from("health_check_results").select("*").eq("id", "latest").maybeSingle(),
    supabase.from("cron_runs").select("key, last_run_on").in("key", CRON_KEYS as unknown as string[]),
  ]);

  const cronRuns: Record<string, string | null> = {};
  for (const key of CRON_KEYS) cronRuns[key] = null;
  for (const row of cronRes.data ?? []) {
    cronRuns[row.key] = row.last_run_on;
  }

  return NextResponse.json({
    lastCheck: resultRes.data ?? null,
    cronRuns,
  });
}
