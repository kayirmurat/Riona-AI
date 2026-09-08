import OpenAI from "openai";
import type { AIProvider, ChatMessage, ToolDefinition, ToolChoice } from "../types";

export class OpenAIAdapter implements AIProvider {
  name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[], toolChoice?: ToolChoice): Promise<ChatMessage> {
    const openaiMessages = messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool" as const, content: m.content, tool_call_id: m.tool_call_id! };
      }
      if (m.role === "assistant" && m.tool_calls) {
        return {
          role: "assistant" as const,
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      return { role: m.role as "system" | "user" | "assistant", content: m.content };
    });

    const openaiTools = tools?.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const openaiToolChoice =
      toolChoice && typeof toolChoice === "object"
        ? { type: "function" as const, function: { name: toolChoice.name } }
        : toolChoice;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages as any,
      tools: openaiTools,
      tool_choice: openaiTools ? (openaiToolChoice ?? "auto") : undefined,
    } as any);

    const choice = response.choices[0].message;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: choice.content ?? "",
        tool_calls: choice.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
      };
    }

    return { role: "assistant", content: choice.content ?? "" };
  }
}
