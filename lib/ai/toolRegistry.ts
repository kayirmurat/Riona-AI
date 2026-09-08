import type { Tool } from "./tool";
import { gmailTool } from "./tools/gmailTool";

export const availableTools: Tool[] = [gmailTool];

export function getToolByName(name: string): Tool | undefined {
  return availableTools.find((t) => t.definition.name === name);
}
