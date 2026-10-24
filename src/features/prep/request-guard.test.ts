import { describe, expect, it } from "vitest";
import { createPrepRequestGuard } from "./request-guard";

describe("prep context request ownership", () => {
  it("rejects older responses, including after selecting A again", () => {
    const guard = createPrepRequestGuard("job-a");
    const firstA = guard.begin();
    guard.select("job-b");
    const requestB = guard.begin();
    expect(guard.accepts(firstA)).toBe(false);
    expect(guard.accepts(requestB)).toBe(true);
    guard.select("job-a");
    const secondA = guard.begin();
    expect(guard.accepts(firstA)).toBe(false);
    expect(guard.accepts(requestB)).toBe(false);
    expect(guard.accepts(secondA)).toBe(true);
    const refreshA = guard.begin();
    expect(guard.accepts(secondA)).toBe(false);
    expect(guard.accepts(refreshA)).toBe(true);
  });

  it("rejects notifications for another selected job or overview", () => {
    const guard = createPrepRequestGuard("job-a");
    const requestA = guard.begin();
    guard.select("job-b");
    expect(guard.acceptsNotification("job-a")).toBe(false);
    expect(guard.acceptsNotification(undefined)).toBe(false);
    expect(guard.accepts(requestA)).toBe(false);
    expect(guard.acceptsNotification("job-b")).toBe(true);
    guard.select(undefined);
    expect(guard.acceptsNotification("job-b")).toBe(false);
    expect(guard.acceptsNotification(undefined)).toBe(true);
  });
});
