import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { createPendingAction } from "../../../../lib/ai/approval";
import { supabase } from "../../../../lib/db/supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const accounts = await listGoogleAccounts();
  let scannedCount = 0;

  for (const acc of accounts) {
    const accessToken = await getValidAccessTokenFor(acc.email);
    if (!accessToken) continue;

    const query = encodeURIComponent(
      "is:unread -category:promotions -category:social -category:updates -category:forums"
    );
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    const messages = listData.messages ?? [];

    for (const m of messages) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers ?? [];
      const from = headers.find((h: any) => h.name === "From")?.value ?? "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "";
      const snippet = msgData.snippet ?? "";

      if (/no-?reply|notification|noreply/i.test(from)) continue;

      const classification = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'Gelen bir e-postayı değerlendir. Kullanıcının kişisel bir cevap yazması gerekiyorsa ilk satıra sadece "EVET" yaz, ardından kısa ve profesyonel bir cevap taslağı yaz. Cevap gerekmiyorsa (bilgilendirme, fatura, bülten, otomatik bildirim vb.) ilk satıra sadece "HAYIR" yaz ve başka hiçbir şey yazma.',
          },
          {
            role: "user",
            content: `Kimden: ${from}\nKonu: ${subject}\nÖzet: ${snippet}`,
          },
        ],
      });

      const raw = classification.choices[0]?.message?.content ?? "";
      const lines = raw.split("\n");
      const needsReply = (lines[0] ?? "").trim().toUpperCase().startsWith("EVET");
      const draftText = lines.slice(1).join("\n").trim();

      let pendingActionId: string | null = null;
      let draftSubject: string | null = null;
      let draftBody: string | null = null;

      if (needsReply) {
        draftSubject = `Re: ${subject}`;
        draftBody = draftText;
        const replyTo = from.match(/<(.+)>/)?.[1] ?? from;

        pendingActionId = await createPendingAction(
          "system-automation",
          "create_email_draft",
          { to: replyTo, subject: draftSubject, body: draftBody, account: acc.label },
          `"${subject}" konulu maile öneri cevap (${acc.label})`
        );
      }

      await supabase.from("scanned_emails").insert({
        account_label: acc.label,
        from_address: from,
        subject,
        snippet,
        needs_reply: needsReply,
        draft_subject: draftSubject,
        draft_body: draftBody,
        pending_action_id: pendingActionId,
        status: needsReply ? "pending" : "info",
      });

      scannedCount++;
    }
  }

  return NextResponse.json({ success: true, scanned: scannedCount });
}
