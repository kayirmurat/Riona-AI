import { NextResponse } from "next/server";
import { checkPipelineHealth } from "../../../../lib/health/pipelineHealth";

// Cron'un aksine burada CRON_SECRET kontrolü yok — bu endpoint middleware'in
// zaten koruduğu normal oturum girişli kullanıcı için (Ayarlar'daki "Şimdi
// Kontrol Et" butonu), sır tabanlı cron erişimi değil.
export async function POST() {
  const result = await checkPipelineHealth();
  return NextResponse.json(result);
}
