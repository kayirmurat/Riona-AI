import { NextResponse } from "next/server";
import { listGoogleAccounts } from "../../../../lib/integrations/google/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await listGoogleAccounts();
  return NextResponse.json({ accounts });
}
