import type { Tool } from "../tool";
import { listGoogleAccounts } from "../../integrations/google/tokens";
import { findEventByTitle, deleteCalendarEvent } from "../../integrations/google/calendar";

// Yıkıcı bir işlem olduğu için riskLevel "medium" — core.ts bunu doğrudan
// çalıştırmadan önce sohbette "onaylıyorum" / "iptal" onayı istiyor.
export const deleteCalendarEventTool: Tool = {
  definition: {
    name: "delete_calendar_event",
    description:
      "Var olan bir takvim etkinliğini/toplantıyı siler. Kullanıcı 'şu toplantıyı iptal et', 'randevuyu sil' gibi bir şey söylediğinde bu aracı kullan.",
    parameters: {
      type: "object",
      properties: {
        title_contains: { type: "string", description: "Silinecek etkinliğin başlığının bir kısmı (etkinliği bulmak için)" },
        account: { type: "string", description: "Hangi hesap: etiket veya e-posta. Belirtilmezse tüm bağlı hesaplarda aranır." },
      },
      required: ["title_contains"],
    },
  },
  riskLevel: "medium",
  async execute(args) {
    const titleContains = typeof args.title_contains === "string" ? args.title_contains.trim() : "";
    if (!titleContains) return "Hangi etkinliğin silineceği belirtilmedi.";

    const accounts = await listGoogleAccounts();
    if (accounts.length === 0) return "Hiçbir Google hesabı bağlı değil.";
    const account = typeof args.account === "string" ? args.account : undefined;
    const candidates = account ? accounts.filter((a) => a.label === account || a.email === account) : accounts;

    for (const acc of candidates) {
      const event = await findEventByTitle(acc.email, titleContains);
      if (!event) continue;

      const ok = await deleteCalendarEvent(acc.email, event.id);
      return ok
        ? `"${event.summary ?? titleContains}" etkinliği silindi.`
        : "Etkinlik bulundu ama silinemedi.";
    }

    return `"${titleContains}" ile eşleşen bir etkinlik bulamadım.`;
  },
};
