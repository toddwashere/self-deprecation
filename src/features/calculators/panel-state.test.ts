import { describe, expect, it } from "vitest";
import { formatMoney, isCalculatorOutput } from "./panel-state";

describe("calculator panel state", () => {
  it("accepts complete calculator results but not a tab-only dashboard result", () => {
    expect(
      isCalculatorOutput({
        tab: "money",
        kind: "runway",
        usableCash: 10_000,
        monthlyBurn: 2_000,
        runwayMonths: 5,
        sustainable: false,
        assumptions: {
          liquidCash: 10_000,
          monthlyExpenses: 2_000,
          monthlyIncome: 0,
          oneTimeCosts: 0,
        },
        progress: { stage: "done", done: 1, total: 1 },
      }),
    ).toBe(true);
    expect(isCalculatorOutput({ tab: "money", counts: {} })).toBe(false);
  });

  it("formats money without hiding cents when they matter", () => {
    expect(formatMoney(60)).toBe("$60");
    expect(formatMoney(144.93)).toBe("$144.93");
  });
});
