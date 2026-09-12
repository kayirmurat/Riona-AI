import { NextResponse } from "next/server";
import { supabase } from "../../../../../lib/db/supabase";
import { fetchEventsSince } from "../../../../../lib/integrations/google/calendar";
import { getStoredSyncToken, advanceSyncToken } from "../../../../../lib/integrations/google/calendarWatch";
import { upsertMeetingFromEvent, scanAndUpsertMeetings } from "../../../../../lib/meetings/detect";
import { dispatchDueBots } from "../../../../../lib/meetings/dispatch";

// Google Calendar push bildirimi (Gmail'in aksine Pub/Sub değil, doğrudan
// webhook) — payload'da hiç veri yok, sadece "bir şey değişti" sinyali header'da
// (X-Goog-Resource-State). Gerçek değişikliği öğrenmek için kendi sakladığımız
// sync_token'dan events.list'i tekrar çekmemiz gerekiyor (Gmail history.list'e
// benzer prensip: payload'a değil kendi state'imize güveniyoruz).
export async function POST(req: Request, { params }: { params: { secret: string } }) {
  if (params.secret !== process.env.CALENDAR_WEBHOOK_PATH_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const resourceState = req.headers.get("x-goog-resource-state");
  const channelId = req.headers.get("x-goog-channel-id");

  // Kanal ilk kurulduğunda Google bir "sync" bildirimi atar — henüz gerçek bir
  // değişiklik yok, sadece kanalın çalıştığını onaylıyor.
  if (resourceState === "sync") {
    return NextResponse.json({ success: true, handled: "sync" });
  }

  const { data: watchRow } = await supabase
    .from("calendar_watch_state")
    .select("email, account_label")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (!watchRow) {
    // Yetim kanal (eski bir kayıttan kalmış, Google'da hâlâ aktif ama bizim
    // izlediğimiz güncel kanal bu değil) — hangi hesaba ait olduğunu
    // bilmiyoruz ama Google bize "bir şey değişti" diyor, bunu sessizce
    // atlamak canlı testte gerçek bir toplantının hiç görünmemesine yol açtı.
    // Hesap eşleşmesi olmadan da güvenle tam taramaya düşüp dispatch tetikleyebiliriz.
    console.error(`[webhooks/calendar] bilinmeyen kanal: ${channelId}, tam taramaya düşülüyor`);
    await scanAndUpsertMeetings();
    const dispatchResult = await dispatchDueBots();
    return NextResponse.json({ success: true, handled: "exists_unknown_channel", dispatch: dispatchResult });
  }

  const account = { email: watchRow.email, label: watchRow.account_label };
  const storedSyncToken = await getStoredSyncToken(account.email);

  if (!storedSyncToken) {
    // Beklenmedik durum (sync token hiç kaydedilmemiş) — tam taramaya düş.
    await scanAndUpsertMeetings();
  } else {
    const result = await fetchEventsSince(account.email, storedSyncToken);
    if (!result.ok) {
      // sync_token_invalid veya error — tam taramaya düş, döngüsel olarak
      // yeniden çapalanana kadar (bir sonraki günlük watch yenilemesinde) bu
      // webhook yolu devre dışı kalır ama periyodik dispatch tarama zaten çalışmaya devam eder.
      await scanAndUpsertMeetings();
    } else {
      for (const event of result.events) {
        await upsertMeetingFromEvent(event, account);
      }
      await advanceSyncToken(account.email, result.newSyncToken);
    }
  }

  // Asıl "anlık" olan kısım burası: değişiklik işlendikten hemen sonra dispatch'i
  // de tetikliyoruz, GitHub Actions'ın periyodik turunu beklemeden.
  const dispatchResult = await dispatchDueBots();
  return NextResponse.json({ success: true, handled: "exists", dispatch: dispatchResult });
}
