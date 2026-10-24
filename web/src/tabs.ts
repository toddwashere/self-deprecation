import type { ComponentType } from "react";
import { TodayPanel } from "../../src/features/brief/panel";
import { SettingsPanel } from "../../src/features/core/panel";
import { ProfilePanel } from "../../src/features/criteria/panel";
import { PeoplePanel } from "../../src/features/crm/panel";
import { EventsPanel } from "../../src/features/events/panel";
import { JobsPanel } from "../../src/features/jobs/panel";
import { NewsPanel } from "../../src/features/news/panel";
import { PrepPanel } from "../../src/features/prep/panel";
import type { Bridge } from "./bridge";

export type TabId =
  | "today"
  | "jobs"
  | "people"
  | "prep"
  | "events"
  | "news"
  | "profile"
  | "settings";

export interface TabDef {
  id: TabId;
  label: string;
  component: ComponentType<{ bridge: Bridge }>;
  enabled: boolean;
}

export const TABS: TabDef[] = [
  { id: "today", label: "Today", component: TodayPanel, enabled: true },
  { id: "jobs", label: "Jobs", component: JobsPanel, enabled: true },
  { id: "people", label: "People", component: PeoplePanel, enabled: true },
  { id: "prep", label: "Prep", component: PrepPanel, enabled: true },
  { id: "events", label: "Events", component: EventsPanel, enabled: true },
  { id: "news", label: "News", component: NewsPanel, enabled: true },
  { id: "profile", label: "Profile", component: ProfilePanel, enabled: true },
  { id: "settings", label: "Settings", component: SettingsPanel, enabled: true },
];
