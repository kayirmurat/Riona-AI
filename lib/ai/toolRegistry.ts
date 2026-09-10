import type { Tool } from "./tool";
import { gmailTool } from "./tools/gmailTool";
import { calendarTool } from "./tools/calendarTool";
import { draftReplyTool } from "./tools/draftReplyTool";
import { briefingTool } from "./tools/briefingTool";
import { memoryTool } from "./tools/memoryTool";

export const availableTools: Tool[] = [gmailTool, calendarTool, draftReplyTool, briefingTool, memoryTool];

export function getToolByName(name: string): Tool | undefined {
  return availableTools.find((t) => t.definition.name === name);
}
