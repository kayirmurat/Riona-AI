import type { ToolDefinition } from "./types";

export interface Tool {
  definition: ToolDefinition;
  riskLevel: "low" | "medium" | "high";
  execute(args: Record<string, any>): Promise<string>;
}
