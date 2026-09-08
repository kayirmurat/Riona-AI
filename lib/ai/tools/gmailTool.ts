import type { Tool } from "../tool";
import { fetchRecentEmails } from "../../integrations/google/gmail";

export const gmailTool: Tool = {
  definition: {
    name: "get_recent_emails",
    description: "Kullanıcının Gmail gelen kutusundaki en son e-postaları (gönderen, konu, özet) getirir.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Kaç e-posta getirileceği (varsayılan 5)" },
      },
    },
  },
  riskLevel: "low",
  async execute(args) {
    const count = typeof args.count === "number" ? args.count : 5;
    return fetchRecentEmails(count);
  },
};
