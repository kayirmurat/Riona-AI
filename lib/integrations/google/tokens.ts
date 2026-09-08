import { supabase } from "../../db/supabase";
import { refreshAccessToken } from "./oauth";

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export async function saveGoogleTokens(tokens: GoogleTokens): Promise<void> {
  await supabase.from("gmail_tokens").upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
}

export async function getGoogleTokens(): Promise<GoogleTokens | null> {
  const { data, error } = await supabase.from("gmail_tokens").select("*").eq("id", 1).single();
  if (error || !data) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry_date,
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getGoogleTokens();
  if (!tokens) return null;

  if (Date.now() < tokens.expiry_date - 60_000) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  await saveGoogleTokens({
    access_token: refreshed.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: refreshed.expiry_date,
  });
  return refreshed.access_token;
}
