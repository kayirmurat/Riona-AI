import type { ToolDefinition } from "./types";

export interface ToolContext {
  conversationId?: string;
}

export interface Tool {
  definition: ToolDefinition;
  riskLevel: "low" | "medium" | "high";
  execute(args: Record<string, any>, context?: ToolContext): Promise<string>;
}
