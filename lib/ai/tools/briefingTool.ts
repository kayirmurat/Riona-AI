import type { Tool } from "../tool";
import { buildEmailBriefing } from "../briefing";

export const briefingTool: Tool = {
  definition: {
    name: "get_email_briefing",
    description:
      "Son 48 saatte taranan maillerin özetini ve onay bekleyen cevap taslaklarının hatırlatmasını verir. Kullanıcı 'bugün mailler nasıl', 'bekleyen bir şey var mı', 'özet ver' gibi bir şey sorduğunda bu aracı kullan.",
    parameters: { type: "object", properties: {} },
  },
  riskLevel: "low",
  async execute() {
    return buildEmailBriefing();
  },
};
