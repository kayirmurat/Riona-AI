import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "../../../../../lib/integrations/google/oauth";
import { saveGoogleAccount } from "../../../../../lib/integrations/google/tokens";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const label = req.nextUrl.searchParams.get("state") ?? "kişisel";

  if (!code) {
    return NextResponse.json({ error: "Kod bulunamadı." }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(code);

  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json();
  const email = profile.emailAddress ?? `bilinmeyen-${Date.now()}`;

  await saveGoogleAccount({
    email,
    label,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  return NextResponse.redirect(new URL("/", req.url));
}
