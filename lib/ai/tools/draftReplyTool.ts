import type { Tool } from "../tool";
import { createEmailDraft } from "../../integrations/google/gmail";

export const draftReplyTool: Tool = {
  definition: {
    name: "create_email_draft",
    description:
      "Belirtilen alıcıya, konuya ve içeriğe sahip bir e-posta taslağı Gmail'de oluşturur (göndermez, sadece taslak olarak kaydeder). Onay gerektirir.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Alıcı e-posta adresi" },
        subject: { type: "string", description: "E-posta konusu" },
        body: { type: "string", description: "E-posta içeriği" },
        account: { type: "string", description: "Hangi hesaptan taslak oluşturulacak (etiket veya e-posta)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  riskLevel: "medium",
  async execute(args) {
    const account = typeof args.account === "string" ? args.account : undefined;
    if (!account) return "Hangi hesaptan oluşturulacağı belirtilmedi.";
    return createEmailDraft(account, args.to, args.subject, args.body);
  },
};
