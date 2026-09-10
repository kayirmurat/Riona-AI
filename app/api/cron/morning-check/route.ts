import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { createCalendarNote } from "../../../../lib/integrations/google/calendar";
import { createPendingAction } from "../../../../lib/ai/approval";
import { supabase } from "../../../../lib/db/supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

const MAX_EMAILS_PER_ACCOUNT = 10;

interface Classification {
  needs_reply: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  is_meeting: boolean;
  meeting_title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  meeting_location: string | null;
}

async function classifyEmail(from: string, subject: string, snippet: string): Promise<Classification> {
  const currentYear = new Date().getFullYear();
  const fallback: Classification = {
    needs_reply: false,
    draft_subject: null,
    draft_body: null,
    is_meeting: false,
    meeting_title: null,
    meeting_start: null,
    meeting_end: null,
    meeting_location: null,
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Bir e-postayı değerlendir ve SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"needs_reply": boolean, "draft_subject": string|null, "draft_body": string|null, "is_meeting": boolean, "meeting_title": string|null, "meeting_start": string|null, "meeting_end": string|null, "meeting_location": string|null}

Kurallar:
- needs_reply: kullanıcının kişisel olarak cevap yazması gerekiyorsa true; bilgilendirme, fatura, bülten, otomatik bildirim veya promosyonsa false.
- needs_reply true ise draft_subject ve draft_body kısa ve profesyonel bir taslakla doldurulsun, değilse ikisi de null olsun.
- is_meeting: e-posta bir toplantı/randevu daveti içeriyorsa veya belirli bir toplantı zamanından bahsediyorsa true.
- is_meeting true ise meeting_title, meeting_start ve meeting_end ISO 8601 formatında (yıl belirtilmemişse ${currentYear} varsay, saat dilimi olarak Türkiye/İstanbul yerel saatini varsay), meeting_location (yoksa null) doldurulsun. Bitiş saati belirtilmemişse başlangıçtan 1 saat sonrası olsun.
- Zamanı makul şekilde tahmin edemiyorsan is_meeting false yap.`,
        },
        { role: "user", content: `Kimden: ${from}\nKonu: ${subject}\nÖzet: ${snippet}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      needs_reply: Boolean(parsed.needs_reply),
      draft_subject: parsed.draft_subject ?? null,
      draft_body: parsed.draft_body ?? null,
      is_meeting: Boolean(parsed.is_meeting),
      meeting_title: parsed.meeting_title ?? null,
      meeting_start: parsed.meeting_start ?? null,
      meeting_end: parsed.meeting_end ?? null,
      meeting_location: parsed.meeting_location ?? null,
    };
  } catch {
    return fallback;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const querySecret = url.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (providedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  try {
    const accounts = await listGoogleAccounts();
    const debug: any[] = [];
    let scannedCount = 0;

    for (const acc of accounts) {
      const accessToken = await getValidAccessTokenFor(acc.email);
      if (!accessToken) {
        debug.push({ account: acc.label, error: "Token alınamadı" });
        continue;
      }

      const query = encodeURIComponent("in:inbox category:primary");
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_EMAILS_PER_ACCOUNT}&q=${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();

      if (!listRes.ok) {
        debug.push({ account: acc.label, gmailError: listData });
        continue;
      }

      const messages: { id: string }[] = listData.messages ?? [];
      let newCount = 0;

      for (const m of messages) {
        // Aynı mesajın aynı hesap altında birden fazla kez eklenmesini önlemek için
        // her mesajdan hemen önce tekrar kontrol edilir (paralel/tekrarlı cron
        // tetiklemelerinde oluşabilecek yarış durumunu daraltır).
        const { data: existingRow } = await supabase
          .from("scanned_emails")
          .select("id")
          .eq("gmail_message_id", m.id)
          .eq("account_label", acc.label)
          .maybeSingle();
        if (existingRow) continue;

        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers ?? [];
        const from = headers.find((h: any) => h.name === "From")?.value ?? "";
        const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
        const snippet = msgData.snippet ?? "";

        if (/no-?reply|notification|noreply/i.test(from)) {
          await supabase.from("scanned_emails").insert({
            gmail_message_id: m.id,
            account_label: acc.label,
            from_address: from,
            subject,
            snippet,
            needs_reply: false,
            status: "info",
          });
          newCount++;
          continue;
        }

        const classification = await classifyEmail(from, subject, snippet);

        let pendingActionId: string | null = null;
        let draftSubject: string | null = null;
        let draftBody: string | null = null;

        if (classification.needs_reply) {
          draftSubject = classification.draft_subject ?? `Re: ${subject}`;
          draftBody = classification.draft_body ?? "";
          const replyTo = from.match(/<(.+)>/)?.[1] ?? from;

          pendingActionId = await createPendingAction(
            "system-automation",
            "create_email_draft",
            { to: replyTo, subject: draftSubject, body: draftBody, account: acc.label },
            `"${subject}" konulu maile öneri cevap (${acc.label})`
          );
        }

        if (
          classification.is_meeting &&
          classification.meeting_title &&
          classification.meeting_start &&
          classification.meeting_end
        ) {
          const calendarResult = await createCalendarNote(acc.email, {
            title: classification.meeting_title,
            start: classification.meeting_start,
            end: classification.meeting_end,
            location: classification.meeting_location,
            description: `Kaynak e-posta: "${subject}" (${from})`,
          });
          debug.push({ account: acc.label, calendarNote: classification.meeting_title, result: calendarResult });
        }

        await supabase.from("scanned_emails").insert({
          gmail_message_id: m.id,
          account_label: acc.label,
          from_address: from,
          subject,
          snippet,
          needs_reply: classification.needs_reply,
          draft_subject: draftSubject,
          draft_body: draftBody,
          pending_action_id: pendingActionId,
          status: classification.needs_reply ? "pending" : "info",
        });

        newCount++;
      }

      debug.push({ account: acc.label, foundMessages: messages.length, newlyScanned: newCount });
      scannedCount += newCount;
    }

    return NextResponse.json({ success: true, scanned: scannedCount, debug });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
