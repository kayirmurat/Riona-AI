import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "../../../../lib/integrations/google/oauth";

export async function GET(req: NextRequest) {
  const label = req.nextUrl.searchParams.get("label") ?? "kişisel";
  return NextResponse.redirect(getGoogleAuthUrl(label));
}
