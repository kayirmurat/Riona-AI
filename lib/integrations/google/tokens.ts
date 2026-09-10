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
  const { data: existing } = await supabase
    .from("google_accounts")
    .select("email")
    .eq("email", account.email)
    .maybeSingle();

  if (existing) {
    await supabase.from("google_accounts").update(account).eq("email", account.email);
  } else {
    await supabase.from("google_accounts").insert(account);
  }
}

export async function listGoogleAccounts(): Promise<{ email: string; label: string }[]> {
  const { data, error } = await supabase.from("google_accounts").select("email, label");
  if (error || !data) return [];

  const seen = new Map<string, { email: string; label: string }>();
  for (const row of data as { email: string; label: string }[]) {
    if (!seen.has(row.email)) seen.set(row.email, row);
  }
  return Array.from(seen.values());
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

async function getAccountByIdentifier(identifier: string): Promise<GoogleAccountTokens | null> {
  const { data, error } = await supabase.from("google_accounts").select("*");
  if (error || !data) return null;

  const exactEmail = data.find((a: any) => a.email === identifier);
  if (exactEmail) return exactEmail as GoogleAccountTokens;

  const normalizedId = normalize(identifier);
  const byLabel = data.find((a: any) => normalize(a.label) === normalizedId);
  return (byLabel as GoogleAccountTokens) ?? null;
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
