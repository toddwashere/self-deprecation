import { describe, expect, it } from "vitest";
import { SOURCES } from "./registry";

describe("source registry", () => {
  it("predeclares unique job and news source IDs", () => {
    const ids = SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SOURCES.some((source) => source.kind === "jobs")).toBe(true);
    expect(SOURCES.some((source) => source.kind === "news")).toBe(true);
  });
});
