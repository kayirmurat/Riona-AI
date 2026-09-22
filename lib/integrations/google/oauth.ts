const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function getGoogleAuthUrl(label: string): string {
  // state, Türkçe karakter (ör. "kişisel") içerebiliyordu — teknik olarak
  // geçerli ama gereksiz bir risk (bazı OAuth aracı/proxy katmanları
  // state'i saf ASCII bekleyebiliyor). base64url ile kodlanıp callback'te
  // geri çözülüyor.
  const encodedLabel = Buffer.from(label, "utf-8").toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.compose",
    access_type: "offline",
    prompt: "consent",
    state: encodedLabel,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();

  // refreshAccessToken'daki ile aynı düzeltme — Google hata döndürdüğünde
  // (ör. kod süresi dolmuş/redirect_uri uyuşmazlığı) bu hiç kontrol
  // edilmiyordu, sessizce undefined token'larla devam edip google_accounts'a
  // bozuk bir kayıt yazılabiliyordu.
  if (!res.ok) {
    throw new Error(
      `Google kod değişimi başarısız (HTTP ${res.status}): ${data?.error ?? "bilinmeyen"} — ${data?.error_description ?? ""}`
    );
  }

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expiry_date: Date.now() + (data.expires_in as number) * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();

  // Google bir hata döndürdüğünde (ör. invalid_grant — refresh token iptal
  // edilmiş/süresi dolmuş) bu kontrol edilmiyordu; fonksiyon data.access_token
  // undefined olsa bile sessizce "başarılı" gibi devam ediyordu — gerçek sebep
  // hiçbir yerde görünmüyordu. Artık fırlatıyor, çağıran taraf (tokens.ts)
  // bunu yakalayıp logluyor.
  if (!res.ok) {
    throw new Error(
      `Google token yenileme başarısız (HTTP ${res.status}): ${data?.error ?? "bilinmeyen"} — ${data?.error_description ?? ""}`
    );
  }

  return {
    access_token: data.access_token as string,
    expiry_date: Date.now() + (data.expires_in as number) * 1000,
  };
}
