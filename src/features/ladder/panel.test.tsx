import { describe, expect, it } from "vitest";
import { isLadderOutput } from "./panel";

describe("Level panel payload validation", () => {
  it("does not treat a tab-only dashboard payload as loaded ladder data", () => {
    expect(isLadderOutput({ tab: "level" })).toBe(false);
    expect(isLadderOutput({ tab: "level", counts: { jobs: 3 } })).toBe(false);
  });

  it("accepts a complete ladder payload", () => {
    expect(
      isLadderOutput({
        tab: "level",
        assessment: null,
        quests: [],
        history: [],
      }),
    ).toBe(true);
  });
});
