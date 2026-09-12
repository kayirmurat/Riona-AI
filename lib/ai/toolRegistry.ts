import type { Tool } from "./tool";
import { gmailTool } from "./tools/gmailTool";
import { calendarTool } from "./tools/calendarTool";
import { draftReplyTool } from "./tools/draftReplyTool";
import { briefingTool } from "./tools/briefingTool";
import { memoryTool } from "./tools/memoryTool";
import { meetingSummaryTool } from "./tools/meetingSummaryTool";
import { generateReplyTool } from "./tools/generateReplyTool";
import { searchEmailsTool } from "./tools/searchEmailsTool";

export const availableTools: Tool[] = [
  gmailTool,
  calendarTool,
  draftReplyTool,
  briefingTool,
  memoryTool,
  meetingSummaryTool,
  generateReplyTool,
  searchEmailsTool,
];

export function getToolByName(name: string): Tool | undefined {
  return availableTools.find((t) => t.definition.name === name);
}
