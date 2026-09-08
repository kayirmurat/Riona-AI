import { NextResponse } from "next/server";
import { listGoogleAccounts, getValidAccessTokenFor } from "../../../../lib/integrations/google/tokens";
import { createPendingAction } from "../../../../lib/ai/approval";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const accounts = await listGoogleAccounts();
  let createdCount = 0;

  for (const acc of accounts) {
    const accessToken = await getValidAccessTokenFor(acc.email);
    if (!accessToken) continue;

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread`,
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

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Kullanıcı adına kısa, profesyonel bir e-posta cevabı taslağı yaz. Sadece cevap metnini yaz, başka açıklama ekleme.",
          },
          {
            role: "user",
            content: `Gelen e-posta:\nKimden: ${from}\nKonu: ${subject}\nÖzet: ${snippet}\n\nBu e-postaya kısa bir cevap taslağı yaz.`,
          },
        ],
      });

      const draftBody = completion.choices[0]?.message?.content ?? "";
      const replyTo = from.match(/<(.+)>/)?.[1] ?? from;

      await createPendingAction(
        "system-automation",
        "create_email_draft",
        { to: replyTo, subject: `Re: ${subject}`, body: draftBody, account: acc.label },
        `Otomatik taslak: "${subject}" konulu maile öneri cevap (${acc.label})`
      );
      createdCount++;
    }
  }

  return NextResponse.json({ success: true, created: createdCount });
}
