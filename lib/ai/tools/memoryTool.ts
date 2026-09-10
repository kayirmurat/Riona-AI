import type { Tool, ToolContext } from "../tool";
import { addFact } from "../memoryFacts";

export const memoryTool: Tool = {
  definition: {
    name: "remember_fact",
    description:
      "Kullanıcı hakkında kalıcı olarak hatırlanması gereken bir tercih, karar veya bağlam bilgisini kaydeder. Bu bilgi TÜM oturumlarda (diğer sohbetlerde de) otomatik olarak hatırlanır. Kullanıcı bir tercih belirttiğinde, bir karar aldığında veya ileride başka bir konuşmada bilinmesi gereken bir şey söylediğinde bu aracı çağır. Kaydettikten sonra kullanıcıya ne hatırladığını kısaca söyle.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string", description: "Kısa, net bir cümleyle hatırlanacak bilgi." },
      },
      required: ["fact"],
    },
  },
  riskLevel: "low",
  async execute(args, context?: ToolContext) {
    const fact = typeof args.fact === "string" ? args.fact : "";
    if (!fact.trim()) return "Hatırlanacak bir bilgi verilmedi.";
    await addFact(fact, context?.conversationId);
    return `Not edildi: "${fact}"`;
  },
};
