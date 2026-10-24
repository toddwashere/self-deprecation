import { describe, expect, it } from "vitest";
import { TABS } from "./tabs";

describe("workspace navigation", () => {
  it("shows only completed, useful destinations", () => {
    expect(
      TABS.filter((tab) => tab.nav !== false).map(({ id, enabled }) => ({ id, enabled })),
    ).toEqual([
      { id: "today", enabled: true },
      { id: "jobs", enabled: true },
      { id: "people", enabled: true },
      { id: "prep", enabled: true },
      { id: "learning", enabled: true },
      { id: "events", enabled: true },
      { id: "news", enabled: true },
      { id: "profile", enabled: true },
      { id: "settings", enabled: true },
    ]);
  });

  it("keeps occasional growth assessment out of primary navigation", () => {
    expect(TABS.find((tab) => tab.id === "level")).toMatchObject({ enabled: true, nav: false });
  });
});
