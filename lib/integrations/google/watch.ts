import { supabase } from "../../db/supabase";

const WATCH_LABEL_IDS = ["INBOX"];

export async function registerWatch(
  email: string,
  label: string,
  accessToken: string
): Promise<{ ok: boolean; message: string }> {
  const topicName = `projects/${process.env.GCP_PROJECT_ID}/topics/${process.env.PUBSUB_TOPIC_NAME}`;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topicName, labelIds: WATCH_LABEL_IDS, labelFilterBehavior: "include" }),
  });
  const data = await res.json();

  if (!res.ok) {
    return { ok: false, message: data?.error?.message ?? "Watch kaydı başarısız." };
  }

  const historyId = String(data.historyId ?? "");
  const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : null;

  await supabase.from("gmail_watch_state").upsert({
    email,
    account_label: label,
    history_id: historyId,
    watch_expiration: expiration,
    updated_at: new Date().toISOString(),
  });

  return { ok: true, message: `Watch kaydedildi (historyId=${historyId}, expiration=${expiration})` };
}

export async function getStoredHistoryId(email: string): Promise<string | null> {
  const { data } = await supabase.from("gmail_watch_state").select("history_id").eq("email", email).maybeSingle();
  return data?.history_id ?? null;
}

type HistoryResult =
  | { ok: true; messageIds: string[]; newHistoryId: string }
  | { ok: false; reason: "history_too_old" | "error" };

export async function fetchHistorySince(email: string, accessToken: string, startHistoryId: string): Promise<HistoryResult> {
  const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) {
    // Gmail history'yi sınırlı bir pencere tutuyor; startHistoryId bu pencerenin
    // dışında kalmışsa 404 döner. Çağıran taraf tam taramaya (messages.list) düşmeli.
    return { ok: false, reason: "history_too_old" };
  }
  if (!res.ok) {
    console.error(`[watch] history.list hatası: email=${email} status=${res.status}`);
    return { ok: false, reason: "error" };
  }

  const data = await res.json();
  console.log(`[watch] history.list ham yanıt: email=${email} startHistoryId=${startHistoryId} newHistoryId=${data.historyId} historyRecords=${(data.history ?? []).length} raw=${JSON.stringify(data.history ?? []).slice(0, 2000)}`);

  const messageIds = new Set<string>();
  for (const record of data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      const labelIds: string[] = added.message?.labelIds ?? [];
      // Bir mail yazılırken Gmail önce geçici bir DRAFT nesnesi oluşturur;
      // gönderilince o taslak silinip yerine yeni bir mesaj ID'si gelir.
      // Taslağın ID'si messagesAdded'da görünse de artık var olmadığı için
      // messages.get her zaman 404 döner — baştan eleniyor.
      if (labelIds.includes("DRAFT")) continue;
      if (added.message?.id) messageIds.add(added.message.id as string);
    }
  }

  return {
    ok: true,
    messageIds: Array.from(messageIds),
    newHistoryId: String(data.historyId ?? startHistoryId),
  };
}

// history_id'yi yalnızca ileri doğru günceller: watch yenileme cron'u ile webhook
// neredeyse aynı anda çalışırsa, biri diğerinin daha yeni yazdığı değeri eski bir
// değerle ezmesin diye.
export async function advanceHistoryId(email: string, newHistoryId: string): Promise<void> {
  const { data: current } = await supabase.from("gmail_watch_state").select("history_id").eq("email", email).maybeSingle();
  const currentValue = current?.history_id ? BigInt(current.history_id) : null;
  const nextValue = BigInt(newHistoryId);
  if (currentValue !== null && nextValue <= currentValue) return;

  await supabase
    .from("gmail_watch_state")
    .update({ history_id: newHistoryId, updated_at: new Date().toISOString() })
    .eq("email", email);
}
