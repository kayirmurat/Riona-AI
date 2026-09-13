import { supabase } from "../db/supabase";
import { listGoogleAccounts } from "../integrations/google/tokens";
import { sendPushToAll } from "../push/sendPush";

interface HealthIssue {
  account: string;
  type: "gmail_watch" | "calendar_watch" | "meeting_dispatch";
  detail: string;
}

// Toplantı botu dispatch cron'u (GitHub Actions, her 10 dk) kendi "catch-up"
// penceresinden (bkz. lib/meetings/dispatch.ts CATCH_UP_WINDOW_MIN=20) daha
// uzun süre önce başlamış ama hâlâ "scheduled" kalmış bir toplantı, dispatch
// cron'unun bir şekilde çalışmadığının/tıkandığının işareti — normalde her
// toplantı ya "dispatched" ya da "failed" olur, "scheduled" kalmaz.
const STUCK_MEETING_GRACE_MIN = 30;

async function findStuckMeetings(): Promise<HealthIssue[]> {
  const cutoff = new Date(Date.now() - STUCK_MEETING_GRACE_MIN * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("meetings")
    .select("id, title, starts_at")
    .eq("status", "scheduled")
    .lt("starts_at", cutoff);

  return (data ?? []).map((m: any) => ({
    account: m.title ?? m.id,
    type: "meeting_dispatch" as const,
    detail: `Toplantı saati geçti ama bot hiç dispatch edilmedi (${m.starts_at}).`,
  }));
}

// Bu tablo henüz oluşturulmamışsa (migration çalıştırılmadan önce) sessizce
// yok sayılır — sonucun kalıcı olarak görünmesi sadece bir ek konfor, kontrolün
// kendisini (ve push bildirimini) engellememeli.
async function persistResult(healthy: boolean, issues: HealthIssue[]): Promise<void> {
  try {
    await supabase.from("health_check_results").upsert({
      id: "latest",
      healthy,
      issues,
      checked_at: new Date().toISOString(),
    });
  } catch {
    // yukarıdaki not.
  }
}

// Bu oturumda iki kez canlıda yaşanan sorun sınıfı — bir watch/kanal sessizce
// süresi dolup/kopup kullanıcı fark etmeden mail veya takvim bildirimlerinin
// akmayı kesmesi — artık günlük olarak proaktif kontrol ediliyor. Watch/kanal
// yenileme cron'ları zaten günlük çalışıyor (vercel.json); bu kontrol onların
// gerçekten işe yaradığını (kayıt var mı, süresi geçmiş mi) doğruluyor.
export async function checkPipelineHealth(): Promise<{ healthy: boolean; issues: HealthIssue[] }> {
  const accounts = await listGoogleAccounts();
  const issues: HealthIssue[] = [];
  const now = Date.now();

  for (const acc of accounts) {
    const { data: gmailState } = await supabase
      .from("gmail_watch_state")
      .select("watch_expiration")
      .eq("email", acc.email)
      .maybeSingle();
    if (!gmailState) {
      issues.push({ account: acc.label, type: "gmail_watch", detail: "Hiç watch kaydı yok." });
    } else if (gmailState.watch_expiration && new Date(gmailState.watch_expiration).getTime() < now) {
      issues.push({ account: acc.label, type: "gmail_watch", detail: `Watch süresi doldu (${gmailState.watch_expiration}).` });
    }

    const { data: calState } = await supabase
      .from("calendar_watch_state")
      .select("channel_expiration")
      .eq("email", acc.email)
      .maybeSingle();
    if (!calState) {
      issues.push({ account: acc.label, type: "calendar_watch", detail: "Hiç takvim watch kaydı yok." });
    } else if (calState.channel_expiration && new Date(calState.channel_expiration).getTime() < now) {
      issues.push({ account: acc.label, type: "calendar_watch", detail: `Takvim watch süresi doldu (${calState.channel_expiration}).` });
    }
  }

  issues.push(...(await findStuckMeetings()));

  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.account}/${i.type}: ${i.detail}`).join(" | ");
    await sendPushToAll(
      {
        title: "Mail/Takvim izleme sorunu",
        body: summary.slice(0, 180),
        url: "/",
      },
      "health"
    );
  }

  const healthy = issues.length === 0;
  await persistResult(healthy, issues);
  return { healthy, issues };
}
