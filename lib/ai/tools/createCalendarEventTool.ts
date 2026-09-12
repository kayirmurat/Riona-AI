import type { Tool } from "../tool";
import { listGoogleAccounts } from "../../integrations/google/tokens";
import { createCalendarNote } from "../../integrations/google/calendar";

function resolveAccountEmail(accounts: { email: string; label: string }[], account?: string): string | null {
  if (!account) return accounts[0]?.email ?? null;
  return accounts.find((a) => a.label === account || a.email === account)?.email ?? account;
}

export const createCalendarEventTool: Tool = {
  definition: {
    name: "create_calendar_event",
    description:
      "Kullanıcının Google Calendar'ına yeni bir etkinlik/toplantı/randevu ekler. Kullanıcı 'takvime ekle', 'toplantı ayarla', 'randevu oluştur' gibi bir şey söylediğinde bu aracı kullan.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Etkinlik başlığı" },
        start: {
          type: "string",
          description:
            "Başlangıç zamanı, ISO 8601 formatında, saat dilimi ofseti EKLEMEDEN düz yerel saat (örn. '2026-09-20T15:00:00') — kullanıcının gerçek saat dilimi ABD Doğu/New York, bu ayrıca ayarlanıyor.",
        },
        end: { type: "string", description: "Bitiş zamanı, aynı formatta. Belirtilmemişse başlangıçtan 1 saat sonrası kullan." },
        location: { type: "string", description: "Yer (opsiyonel)" },
        description: { type: "string", description: "Açıklama (opsiyonel)" },
        account: { type: "string", description: "Hangi hesaba ekleneceği: etiket veya e-posta. Belirtilmezse ilk bağlı hesap kullanılır." },
      },
      required: ["title", "start", "end"],
    },
  },
  riskLevel: "low",
  async execute(args) {
    const accounts = await listGoogleAccounts();
    if (accounts.length === 0) return "Hiçbir Google hesabı bağlı değil.";
    const targetEmail = resolveAccountEmail(accounts, typeof args.account === "string" ? args.account : undefined);
    if (!targetEmail) return "Hesap bulunamadı.";

    const result = await createCalendarNote(targetEmail, {
      title: args.title,
      start: args.start,
      end: args.end,
      location: typeof args.location === "string" ? args.location : null,
      description: typeof args.description === "string" ? args.description : undefined,
    });
    return result.message;
  },
};
