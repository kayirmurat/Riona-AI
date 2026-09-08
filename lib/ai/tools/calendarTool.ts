import type { Tool } from "../tool";
import { fetchUpcomingEvents } from "../../integrations/google/calendar";

export const calendarTool: Tool = {
  definition: {
    name: "get_upcoming_events",
    description: "Kullanıcının Google Calendar'ındaki yaklaşan etkinlikleri (başlık, zaman, yer) getirir.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Kaç etkinlik getirileceği (varsayılan 5)" },
      },
    },
  },
  riskLevel: "low",
  async execute(args) {
    const count = typeof args.count === "number" ? args.count : 5;
    return fetchUpcomingEvents(count);
  },
};
