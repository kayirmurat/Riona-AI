import type { Tool } from "./tool";
import { gmailTool } from "./tools/gmailTool";
import { calendarTool } from "./tools/calendarTool";
import { draftReplyTool } from "./tools/draftReplyTool";
import { briefingTool } from "./tools/briefingTool";
import { memoryTool } from "./tools/memoryTool";
import { meetingSummaryTool } from "./tools/meetingSummaryTool";
import { generateReplyTool } from "./tools/generateReplyTool";
import { searchEmailsTool } from "./tools/searchEmailsTool";
import { createCalendarEventTool } from "./tools/createCalendarEventTool";
import { updateCalendarEventTool } from "./tools/updateCalendarEventTool";
import { deleteCalendarEventTool } from "./tools/deleteCalendarEventTool";

export const availableTools: Tool[] = [
  gmailTool,
  calendarTool,
  draftReplyTool,
  briefingTool,
  memoryTool,
  meetingSummaryTool,
  generateReplyTool,
  searchEmailsTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
];

export function getToolByName(name: string): Tool | undefined {
  return availableTools.find((t) => t.definition.name === name);
}
