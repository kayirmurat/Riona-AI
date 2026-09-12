import type { ComponentType } from "react";
import MailModule from "./MailModule";
import CalendarModule from "./CalendarModule";
import MeetingsModule from "./MeetingsModule";

export interface ModuleDefinition {
  id: string;
  title: string;
  component: ComponentType;
}

// Gelecekte telefon asistanı gibi yeni paneller eklemek için buraya bir satır
// eklemek yeterli — Sidebar bu diziyi otomatik render eder.
export const modules: ModuleDefinition[] = [
  { id: "mail", title: "Mail", component: MailModule },
  { id: "calendar", title: "Takvim", component: CalendarModule },
  { id: "meetings", title: "Toplantılar", component: MeetingsModule },
];
