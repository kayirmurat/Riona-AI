import { supabase } from "../db/supabase";
import { listGoogleAccounts } from "../integrations/google/tokens";
import { sendPushToAll } from "../push/sendPush";

interface HealthIssue {
  account: string;
  type: "gmail_watch" | "calendar_watch";
  detail: string;
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

  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.account}/${i.type}: ${i.detail}`).join(" | ");
    await sendPushToAll({
      title: "Mail/Takvim izleme sorunu",
      body: summary.slice(0, 180),
      url: "/",
    });
  }

  return { healthy: issues.length === 0, issues };
}
