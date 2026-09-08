import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "../../../../../lib/integrations/google/oauth";
import { saveGoogleTokens } from "../../../../../lib/integrations/google/tokens";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Kod bulunamadı." }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(code);
  await saveGoogleTokens(tokens);

  return NextResponse.redirect(new URL("/", req.url));
}
