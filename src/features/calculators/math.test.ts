import { describe, expect, it } from "vitest";
import { calculateRate, calculateRunway } from "./math";

describe("T8 calculator math", () => {
  it("converts salary to transparent contract revenue, hourly, and day targets", () => {
    expect(calculateRate({ annualSalary: 120_000 })).toEqual({
      annualTarget: 200_000,
      monthlyTarget: 16_666.67,
      hourlyRate: 144.93,
      dayRate: 1_159.42,
      assumptions: {
        annualSalary: 120_000,
        benefitsPercent: 25,
        reservePercent: 25,
        billableWeeks: 46,
        billableHoursPerWeek: 30,
        hoursPerDay: 8,
      },
    });
    expect(
      calculateRate({
        annualSalary: 100_000,
        benefitsPercent: 20,
        reservePercent: 0,
        billableWeeks: 50,
        billableHoursPerWeek: 40,
        hoursPerDay: 8,
      }),
    ).toMatchObject({ annualTarget: 120_000, hourlyRate: 60, dayRate: 480 });
  });

  it("calculates runway from usable cash and net monthly burn", () => {
    expect(
      calculateRunway({
        liquidCash: 60_000,
        monthlyExpenses: 10_000,
        monthlyIncome: 2_500,
        oneTimeCosts: 5_000,
      }),
    ).toEqual({
      usableCash: 55_000,
      monthlyBurn: 7_500,
      runwayMonths: 7.33,
      sustainable: false,
      assumptions: {
        liquidCash: 60_000,
        monthlyExpenses: 10_000,
        monthlyIncome: 2_500,
        oneTimeCosts: 5_000,
      },
    });
    expect(
      calculateRunway({ liquidCash: 1_000, monthlyExpenses: 4_000, monthlyIncome: 4_000 }),
    ).toMatchObject({ monthlyBurn: 0, runwayMonths: null, sustainable: true });
    expect(calculateRunway({ liquidCash: 0, monthlyExpenses: 1_000 })).toMatchObject({
      usableCash: 0,
      runwayMonths: 0,
      sustainable: false,
    });
  });
});
