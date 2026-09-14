import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { registerWatch } from "../../../../lib/integrations/google/watch";
import { registerCalendarWatch } from "../../../../lib/integrations/google/calendarWatch";

// Sağlık kontrolünün bulduğu Gmail/Takvim watch sorunlarını (kayıt yok/süresi
// dolmuş) tek tıkla düzeltmek için — mevcut /api/gmail/watch ve
// /api/calendar/watch cron'lar CRON_SECRET gerektiriyor; bu endpoint oturum
// girişli kullanıcı için aynı kayıt fonksiyonlarını doğrudan çağırıyor.
export async function POST() {
  const accounts = await listGoogleAccounts();
  const results: { account: string; gmail: { ok: boolean; message: string }; calendar: { ok: boolean; message: string } }[] = [];

  for (const acc of accounts) {
    const accessToken = await getValidAccessTokenFor(acc.email);
    if (!accessToken) {
      const failed = { ok: false, message: "Token alınamadı." };
      results.push({ account: acc.label, gmail: failed, calendar: failed });
      continue;
    }
    const [gmail, calendar] = await Promise.all([
      registerWatch(acc.email, acc.label, accessToken),
      registerCalendarWatch(acc.email, acc.label, accessToken),
    ]);
    results.push({ account: acc.label, gmail, calendar });
  }

  console.log("[fix-watches] sonuçlar:", JSON.stringify(results));
  return NextResponse.json({ results });
}
