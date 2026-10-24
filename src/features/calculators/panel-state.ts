import { type RateOutput, type RunwayOutput, rateOutputSchema, runwayOutputSchema } from "./tools";

export type CalculatorOutput = RateOutput | RunwayOutput;

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
