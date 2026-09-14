import { supabase } from "../db/supabase";

// Vercel Hobby planı cron'ları günde bir defadan sık çalıştıramıyor ve
// saat dilimi bilmiyor — sabit bir UTC saati, ABD kış/yaz saati (EDT/EST)
// arasında geçişte gerçek yerel saatten 1 saat kayıyordu. Bunun yerine bu
// tür cron'lar artık saatlik tetikleniyor (bkz. .github/workflows) ve HER
// ÇAĞRIDA burada gerçek yerel saatin hedef saate denk gelip gelmediği
// kontrol ediliyor — DST geçişinde elle hiçbir ayar gerekmiyor.
export function getHourIn(timeZone: string, date: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).format(date);
  const hour = parseInt(formatted, 10);
  return hour === 24 ? 0 : hour;
}

function getDateKeyIn(timeZone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

// Saatlik tetiklemenin aynı gün içinde (örn. yeniden deneme/gecikme
// yüzünden) iki kez gerçek işi yapmasını önleyen ek bir güvence — saat
// kontrolü zaten tek başına günde bir kez tetiklenmeyi sağlıyor, bu sadece
// ikinci bir katman. `cron_runs` tablosu henüz oluşturulmamışsa (migration
// çalıştırılmadan önce) sessizce "çalıştır" (true) döner.
export async function claimDailyRun(key: string, timeZone: string): Promise<boolean> {
  const today = getDateKeyIn(timeZone);
  try {
    const { data, error } = await supabase.from("cron_runs").select("last_run_on").eq("key", key).maybeSingle();
    if (error) return true;
    if (data?.last_run_on === today) return false;
    // Bu yazmanın hatası daha önce sessizce yutuluyordu — asıl görev (cron'un
    // kendisi) yine de çalışıyordu ama "çalıştı" kaydı hiç düşmediği için
    // Ayarlar'daki "son çalışma" listesi hep "hiç çalışmadı" gösteriyordu.
    const { error: writeError } = await supabase.from("cron_runs").upsert({ key, last_run_on: today });
    if (writeError) console.error(`[cron] "${key}" için last_run_on yazılamadı:`, writeError.message);
    return true;
  } catch {
    return true;
  }
}
