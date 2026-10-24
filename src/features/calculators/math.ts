export interface RateInput {
  annualSalary: number;
  benefitsPercent?: number;
  reservePercent?: number;
  billableWeeks?: number;
  billableHoursPerWeek?: number;
  hoursPerDay?: number;
}

export interface RunwayInput {
  liquidCash: number;
  monthlyExpenses: number;
  monthlyIncome?: number;
  oneTimeCosts?: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateRate(input: RateInput) {
  const assumptions = {
    annualSalary: input.annualSalary,
    benefitsPercent: input.benefitsPercent ?? 25,
    reservePercent: input.reservePercent ?? 25,
    billableWeeks: input.billableWeeks ?? 46,
    billableHoursPerWeek: input.billableHoursPerWeek ?? 30,
    hoursPerDay: input.hoursPerDay ?? 8,
  };
  const loadedCompensation = assumptions.annualSalary * (1 + assumptions.benefitsPercent / 100);
  const annualTarget = loadedCompensation / (1 - assumptions.reservePercent / 100);
  const hourlyRate = annualTarget / (assumptions.billableWeeks * assumptions.billableHoursPerWeek);
  return {
    annualTarget: money(annualTarget),
    monthlyTarget: money(annualTarget / 12),
    hourlyRate: money(hourlyRate),
    dayRate: money(hourlyRate * assumptions.hoursPerDay),
    assumptions,
  };
}

export function calculateRunway(input: RunwayInput) {
  const assumptions = {
    liquidCash: input.liquidCash,
    monthlyExpenses: input.monthlyExpenses,
    monthlyIncome: input.monthlyIncome ?? 0,
    oneTimeCosts: input.oneTimeCosts ?? 0,
  };
  const usableCash = Math.max(0, assumptions.liquidCash - assumptions.oneTimeCosts);
  const monthlyBurn = Math.max(0, assumptions.monthlyExpenses - assumptions.monthlyIncome);
  const sustainable = monthlyBurn === 0;
  return {
    usableCash: money(usableCash),
    monthlyBurn: money(monthlyBurn),
    runwayMonths: sustainable ? null : money(usableCash / monthlyBurn),
    sustainable,
    assumptions,
  };
}
