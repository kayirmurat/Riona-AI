import type { ComponentType } from "react";
import MailModule from "./MailModule";
import MeetingsModule from "./MeetingsModule";

export interface ModuleDefinition {
  id: string;
  title: string;
  component: ComponentType;
}

// Gelecekte Calendar/telefon asistanı gibi yeni paneller eklemek için
// buraya bir satır eklemek yeterli — shell bu diziyi otomatik render eder.
export const modules: ModuleDefinition[] = [
  { id: "mail", title: "Mail", component: MailModule },
  { id: "meetings", title: "Toplantılar", component: MeetingsModule },
];
