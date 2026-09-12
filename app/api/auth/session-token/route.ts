import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Tarayıcıdaki Supabase Realtime client'ının gerçek bir oturuma sahip olabilmesi
// için httpOnly cookie'lerdeki token'ları bir kerelik JS'e aktarıyor. Bu route
// middleware.ts'in normal cookie-auth akışından geçiyor (bypass listesinde DEĞİL),
// yani buraya kadar gelen isteğin cookie'leri zaten geçerli.
export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("sb-access-token")?.value;
  const refreshToken = req.cookies.get("sb-refresh-token")?.value;

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  return NextResponse.json({ access_token: accessToken, refresh_token: refreshToken });
}
