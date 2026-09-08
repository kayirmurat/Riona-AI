import { supabase } from "../../db/supabase";
import { refreshAccessToken } from "./oauth";

interface GoogleAccountTokens {
  email: string;
  label: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export async function saveGoogleAccount(account: GoogleAccountTokens): Promise<void> {
  await supabase.from("google_accounts").upsert(account);
}

export async function listGoogleAccounts(): Promise<{ email: string; label: string }[]> {
  const { data, error } = await supabase.from("google_accounts").select("email, label");
  if (error || !data) return [];
  return data;
}

async function getAccountByIdentifier(identifier: string): Promise<GoogleAccountTokens | null> {
  const byEmail = await supabase.from("google_accounts").select("*").eq("email", identifier).maybeSingle();
  if (byEmail.data) return byEmail.data as GoogleAccountTokens;

  const byLabel = await supabase.from("google_accounts").select("*").eq("label", identifier).maybeSingle();
  return (byLabel.data as GoogleAccountTokens) ?? null;
}

export async function getValidAccessTokenFor(identifier: string): Promise<string | null> {
  const account = await getAccountByIdentifier(identifier);
  if (!account) return null;

  if (Date.now() < account.expiry_date - 60_000) {
    return account.access_token;
  }

  const refreshed = await refreshAccessToken(account.refresh_token);
  await saveGoogleAccount({
    email: account.email,
    label: account.label,
    access_token: refreshed.access_token,
    refresh_token: account.refresh_token,
    expiry_date: refreshed.expiry_date,
  });
  return refreshed.access_token;
}
