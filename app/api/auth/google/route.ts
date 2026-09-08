import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "../../../../lib/integrations/google/oauth";

export async function GET() {
  return NextResponse.redirect(getGoogleAuthUrl());
}
