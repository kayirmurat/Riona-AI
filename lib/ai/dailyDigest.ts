import { supabase } from "../db/supabase";
import { sendPushToAll } from "../push/sendPush";

interface DigestStats {
  totalScanned: number;
  pendingReplies: number;
  categoryCounts: Record<string, number>;
}

// Kullanıcının her sabah "gerçekten mailler taranıyor mu" diye kontrol
// etmesine gerek kalmasın diye: son 24 saatte taranan maillerin kısa bir
// özetini push bildirimi olarak gönderir. Hiç mail taranmadıysa (hesap
// bağlı değil, watch bozulmuş olabilir) sessizce bildirim ATLAMAZ — bunu
// çağıran cron endpoint'i zaten sonucu debug amaçlı JSON olarak döner.
export async function buildAndSendDailyDigest(): Promise<{ sent: boolean; stats: DigestStats }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("scanned_emails")
    .select("needs_reply, status, category")
    .gte("created_at", since);

  const rows = data ?? [];
  const totalScanned = rows.length;
  const pendingReplies = rows.filter((r: any) => r.needs_reply && r.status === "pending").length;

  const categoryCounts: Record<string, number> = {};
  for (const row of rows as any[]) {
    const cat = row.category ?? "Diğer";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  const stats: DigestStats = { totalScanned, pendingReplies, categoryCounts };

  if (totalScanned === 0) {
    return { sent: false, stats };
  }

  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, count]) => `${cat} (${count})`)
    .join(", ");

  await sendPushToAll({
    title: "Günlük Mail Özeti",
    body: `Son 24 saatte ${totalScanned} mail tarandı, ${pendingReplies} onay bekliyor. En çok: ${topCategories}`,
    url: "/",
  });

  return { sent: true, stats };
}
