import { describe, expect, it } from "vitest";
import {
  calculatorFormForOutput,
  formatMoney,
  isCalculatorOutput,
  parseCalculatorForm,
  updateCalculatorForm,
} from "./panel-state";

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

  it("hydrates editable fields from every returned rate assumption", () => {
    const values = calculatorFormForOutput({
      tab: "money",
      kind: "rate",
      annualTarget: 250_000,
      monthlyTarget: 20_833.33,
      hourlyRate: 181.16,
      dayRate: 1_449.28,
      assumptions: {
        annualSalary: 175_000,
        benefitsPercent: 20,
        reservePercent: 30,
        billableWeeks: 44,
        billableHoursPerWeek: 32,
        hoursPerDay: 8,
      },
      progress: { stage: "done", done: 1, total: 1 },
    });

    expect(values).toEqual({
      annualSalary: "175000",
      benefitsPercent: "20",
      reservePercent: "30",
      billableWeeks: "44",
      billableHoursPerWeek: "32",
      hoursPerDay: "8",
    });
    expect(updateCalculatorForm(values, "reservePercent", "35")).toEqual({
      ...values,
      reservePercent: "35",
    });
  });

  it("hydrates editable fields from every returned runway assumption", () => {
    expect(
      calculatorFormForOutput({
        tab: "money",
        kind: "runway",
        usableCash: 80_000,
        monthlyBurn: 6_500,
        runwayMonths: 12.31,
        sustainable: false,
        assumptions: {
          liquidCash: 90_000,
          monthlyExpenses: 8_000,
          monthlyIncome: 1_500,
          oneTimeCosts: 10_000,
        },
        progress: { stage: "done", done: 1, total: 1 },
      }),
    ).toEqual({
      liquidCash: "90000",
      monthlyExpenses: "8000",
      monthlyIncome: "1500",
      oneTimeCosts: "10000",
    });
  });

  it.each([
    ["rate", "annualSalary"],
    ["runway", "liquidCash"],
    ["runway", "monthlyExpenses"],
  ] as const)("rejects a blank required %s field: %s", (mode, requiredField) => {
    const values: Record<string, string> =
      mode === "rate"
        ? {
            annualSalary: "120000",
            benefitsPercent: "25",
            reservePercent: "25",
            billableWeeks: "46",
            billableHoursPerWeek: "30",
            hoursPerDay: "8",
          }
        : {
            liquidCash: "50000",
            monthlyExpenses: "8000",
            monthlyIncome: "0",
            oneTimeCosts: "0",
          };

    expect(parseCalculatorForm(mode, { ...values, [requiredField]: "  " })).toEqual({
      ok: false,
      reason: "required",
    });
  });

  it("omits blank optional values instead of silently turning them into zero", () => {
    expect(
      parseCalculatorForm("runway", {
        liquidCash: "50000",
        monthlyExpenses: "8000",
        monthlyIncome: "",
        oneTimeCosts: " ",
      }),
    ).toEqual({
      ok: true,
      args: { liquidCash: 50000, monthlyExpenses: 8000 },
    });
  });
});
