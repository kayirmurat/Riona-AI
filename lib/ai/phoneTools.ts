import { availableTools } from "./toolRegistry";
import type { ToolDefinition } from "./types";

// Telefon hattı herkese açık (dış arayanlar) olduğu için, sohbetteki tam araç
// setinin aksine buradaki alt ajan bilinçli olarak ÇOK dar bir yetkiye sahip
// — arayana kişisel mail/takvim bilgisi sızdırmasın diye. Şimdilik sadece
// mesaj alma; ileride (müsaitlik kontrolü gibi) güvenli ek yetkiler burada
// tek tek listeye eklenir.
const PHONE_TOOL_NAMES = ["take_message"];

export function getPhoneToolDefinitions(): ToolDefinition[] {
  return availableTools.filter((t) => PHONE_TOOL_NAMES.includes(t.definition.name)).map((t) => t.definition);
}
