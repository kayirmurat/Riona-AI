import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "../../../../../lib/integrations/google/oauth";
import { saveGoogleAccount } from "../../../../../lib/integrations/google/tokens";

function decodeLabel(state: string | null): string {
  if (!state) return "kişisel";
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    return decoded || "kişisel";
  } catch {
    // getGoogleAuthUrl artık base64url ile kodluyor — eski (bu değişiklikten
    // önce) başlatılmış, hâlâ havada olan bir akıştan gelen ham state olabilir.
    return state;
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const label = decodeLabel(req.nextUrl.searchParams.get("state"));

  if (!code) {
    return NextResponse.json({ error: "Kod bulunamadı." }, { status: 400 });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err: any) {
    console.error("[auth/google/callback] token değişimi başarısız:", err);
    return NextResponse.json({ error: err?.message ?? "Google ile bağlantı kurulamadı." }, { status: 500 });
  }

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
