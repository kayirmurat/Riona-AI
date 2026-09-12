import type { Tool } from "../tool";
import { listGoogleAccounts } from "../../integrations/google/tokens";
import { findEventByTitle, updateCalendarEvent } from "../../integrations/google/calendar";

export const updateCalendarEventTool: Tool = {
  definition: {
    name: "update_calendar_event",
    description:
      "Var olan bir takvim etkinliğinin saatini, başlığını, yerini veya açıklamasını değiştirir. Kullanıcı 'şu toplantının saatini değiştir', 'randevuyu ertele' gibi bir şey söylediğinde bu aracı kullan.",
    parameters: {
      type: "object",
      properties: {
        title_contains: { type: "string", description: "Değiştirilecek etkinliğin başlığının bir kısmı (etkinliği bulmak için)" },
        new_title: { type: "string", description: "Yeni başlık (opsiyonel)" },
        new_start: { type: "string", description: "Yeni başlangıç zamanı, ISO 8601, saat dilimi ofseti EKLEMEDEN (örn. '2026-09-20T16:00:00')" },
        new_end: { type: "string", description: "Yeni bitiş zamanı, aynı formatta" },
        new_location: { type: "string", description: "Yeni yer (opsiyonel)" },
        new_description: { type: "string", description: "Yeni açıklama (opsiyonel)" },
        account: { type: "string", description: "Hangi hesap: etiket veya e-posta. Belirtilmezse tüm bağlı hesaplarda aranır." },
      },
      required: ["title_contains"],
    },
  },
  riskLevel: "low",
  async execute(args) {
    const titleContains = typeof args.title_contains === "string" ? args.title_contains.trim() : "";
    if (!titleContains) return "Hangi etkinliğin güncelleneceği belirtilmedi.";

    const accounts = await listGoogleAccounts();
    if (accounts.length === 0) return "Hiçbir Google hesabı bağlı değil.";
    const account = typeof args.account === "string" ? args.account : undefined;
    const candidates = account ? accounts.filter((a) => a.label === account || a.email === account) : accounts;

    for (const acc of candidates) {
      const event = await findEventByTitle(acc.email, titleContains);
      if (!event) continue;

      const ok = await updateCalendarEvent(acc.email, event.id, {
        title: typeof args.new_title === "string" ? args.new_title : undefined,
        start: typeof args.new_start === "string" ? args.new_start : undefined,
        end: typeof args.new_end === "string" ? args.new_end : undefined,
        location: typeof args.new_location === "string" ? args.new_location : undefined,
        description: typeof args.new_description === "string" ? args.new_description : undefined,
      });
      return ok
        ? `"${event.summary ?? titleContains}" etkinliği güncellendi.`
        : "Etkinlik bulundu ama güncellenemedi.";
    }

    return `"${titleContains}" ile eşleşen bir etkinlik bulamadım.`;
  },
};
