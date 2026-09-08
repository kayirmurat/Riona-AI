import type { Tool } from "../tool";
import { fetchRecentEmails } from "../../integrations/google/gmail";

export const gmailTool: Tool = {
  definition: {
    name: "get_recent_emails",
    description:
      "Kullanıcının Gmail gelen kutusundaki en son e-postaları getirir. Birden fazla hesap bağlıysa 'account' belirtilmezse hepsi taranır.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Kaç e-posta getirileceği (varsayılan 5)" },
        account: { type: "string", description: "Hangi hesap: 'kişisel', 'iş' gibi bir etiket veya e-posta adresi. Belirtilmezse tüm bağlı hesaplar taranır." },
      },
    },
  },
  riskLevel: "low",
  async execute(args) {
    const count = typeof args.count === "number" ? args.count : 5;
    const account = typeof args.account === "string" ? args.account : undefined;
    return fetchRecentEmails(count, account);
  },
};
