import { type RateOutput, type RunwayOutput, rateOutputSchema, runwayOutputSchema } from "./tools";

export type CalculatorOutput = RateOutput | RunwayOutput;
export type CalculatorMode = CalculatorOutput["kind"];
export type CalculatorFormValues = Record<string, string>;

const requiredFields: Record<CalculatorMode, ReadonlySet<string>> = {
  rate: new Set(["annualSalary"]),
  runway: new Set(["liquidCash", "monthlyExpenses"]),
};

export function isCalculatorOutput(value: unknown): value is CalculatorOutput {
  return rateOutputSchema.safeParse(value).success || runwayOutputSchema.safeParse(value).success;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculatorFormForOutput(output: CalculatorOutput): CalculatorFormValues {
  return Object.fromEntries(
    Object.entries(output.assumptions).map(([key, value]) => [key, String(value)]),
  );
}

export function updateCalculatorForm(
  values: CalculatorFormValues,
  key: string,
  value: string,
): CalculatorFormValues {
  return { ...values, [key]: value };
}

export function isRequiredCalculatorField(mode: CalculatorMode, key: string): boolean {
  return requiredFields[mode].has(key);
}

export function parseCalculatorForm(
  mode: CalculatorMode,
  values: CalculatorFormValues,
): { ok: true; args: Record<string, number> } | { ok: false; reason: "required" | "number" } {
  const args: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(values)) {
    const value = rawValue.trim();
    if (!value) {
      if (isRequiredCalculatorField(mode, key)) return { ok: false, reason: "required" };
      continue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return { ok: false, reason: "number" };
    args[key] = parsed;
  }
  return { ok: true, args };
}
