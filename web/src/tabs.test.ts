import { describe, expect, it } from "vitest";
import { TABS } from "./tabs";

describe("workspace navigation", () => {
  it("shows only completed, useful destinations", () => {
    expect(TABS.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: "today", enabled: true },
      { id: "jobs", enabled: true },
      { id: "people", enabled: true },
      { id: "prep", enabled: true },
      { id: "events", enabled: true },
      { id: "news", enabled: true },
      { id: "profile", enabled: true },
      { id: "settings", enabled: true },
    ]);
  });
});
