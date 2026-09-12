import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/db/supabase";
import { summarizeMeeting } from "../../../../lib/ai/meetingSummary";

// Bakım amaçlı endpoint: transkript ayrıştırma mantığı düzeltildiğinde (bkz.
// lib/meetings/transcriptFormat.ts) daha önce bozuk transkript metniyle
// üretilmiş (uydurma/alakasız) özetleri, kullanıcıya yeni bir toplantı testi
// yaptırmadan, kayıtlı ham transkripttan yeniden üretmek için kullanılıyor.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("id, transcript")
    .not("transcript", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  const results: { id: string; status: string }[] = [];

  for (const meeting of meetings ?? []) {
    const summary = await summarizeMeeting(meeting.transcript);
    await supabase
      .from("meetings")
      .update({
        summary_tr: summary?.summary_tr ?? null,
        summary_en: summary?.summary_en ?? null,
        status: summary ? "completed" : "transcribed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);
    updated++;
    results.push({ id: meeting.id, status: summary ? "completed" : "transcribed" });
  }

  return NextResponse.json({ success: true, updated, results });
}

export async function GET(req: Request) {
  return POST(req);
}
