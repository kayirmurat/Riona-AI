import type { Tool } from "./tool";
import { gmailTool } from "./tools/gmailTool";
import { calendarTool } from "./tools/calendarTool";
import { draftReplyTool } from "./tools/draftReplyTool";

export const availableTools: Tool[] = [gmailTool, calendarTool, draftReplyTool];

export function getToolByName(name: string): Tool | undefined {
  return availableTools.find((t) => t.definition.name === name);
}
