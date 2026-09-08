import type { Tool } from "../tool";
import { fetchUpcomingEvents } from "../../integrations/google/calendar";

export const calendarTool: Tool = {
  definition: {
    name: "get_upcoming_events",
    description:
      "Kullanıcının Google Calendar'ındaki yaklaşan etkinlikleri getirir. Birden fazla hesap bağlıysa 'account' belirtilmezse hepsi taranır.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Kaç etkinlik getirileceği (varsayılan 5)" },
        account: { type: "string", description: "Hangi hesap: 'kişisel', 'iş' gibi bir etiket veya e-posta adresi. Belirtilmezse tüm bağlı hesaplar taranır." },
      },
    },
  },
  riskLevel: "low",
  async execute(args) {
    const count = typeof args.count === "number" ? args.count : 5;
    const account = typeof args.account === "string" ? args.account : undefined;
    return fetchUpcomingEvents(count, account);
  },
};
