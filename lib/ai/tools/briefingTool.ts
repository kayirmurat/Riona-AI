import type { Tool } from "../tool";
import { buildEmailBriefing } from "../briefing";

export const briefingTool: Tool = {
  definition: {
    name: "get_email_briefing",
    description:
      "Son 48 saatte taranan maillerin ham verisini ve onay bekleyen cevap taslaklarını döndürür. Kullanıcı 'bugün mailler nasıl', 'bekleyen bir şey var mı', 'özet ver' gibi bir şey sorduğunda bu aracı kullan. Bu aracın sonucunu kullanıcıya aktarırken madde madde liste yapma — akıcı, anlatı tarzında bir durum özeti olarak anlat.",
    parameters: { type: "object", properties: {} },
  },
  riskLevel: "low",
  async execute() {
    return buildEmailBriefing();
  },
};
