import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Sunucu tarafındaki lib/db/supabase.ts'in tersine burada SECRET_KEY yok — sadece
// tarayıcıya güvenle gömülebilecek NEXT_PUBLIC_ değişkenler kullanılıyor. RLS bu
// client için authenticated olmayı şart koştuğundan, /api/auth/session-token'dan
// alınan gerçek oturum token'ları setSession ile bağlanmadan Realtime hiçbir satır
// göremez — client oluşturulduktan hemen sonra bunu bekliyoruz.
//
// Tanı amaçlı: bu modülün tarayıcıda hiç yüklenip yüklenmediğini ve env
// değişkenlerinin build'e gömülüp gömülmediğini görmek için modül yüklenir
// yüklenmez (herhangi bir fonksiyon çağrılmadan) loglar.
console.log(
  "[Realtime] supabaseBrowser modülü yüklendi. URL var mı:",
  !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  "AnonKey var mı:",
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

let clientPromise: Promise<SupabaseClient> | null = null;

async function initBrowserSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log("[Realtime] initBrowserSupabase çalıştı. url uzunluğu:", url?.length ?? 0, "anonKey uzunluğu:", anonKey?.length ?? 0);
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı değil.");
  }

  const client = createClient(url, anonKey);

  try {
    const res = await fetch("/api/auth/session-token");
    if (res.ok) {
      const { access_token, refresh_token } = await res.json();
      if (access_token && refresh_token) {
        await client.auth.setSession({ access_token, refresh_token });
      }
    }
    // 401 (oturum yok) — client'ı yine döneceğiz, RLS altında Realtime sessizce
    // hiçbir event vermeyecek, sayfa çökmeyecek.
  } catch {
    // Ağ hatası — aynı şekilde sessizce devam.
  }

  return client;
}

export function getBrowserSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = initBrowserSupabase();
  }
  return clientPromise;
}
