import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { calculateRate, calculateRunway } from "./math";

const amount = z.number().finite().min(0).max(100_000_000);
const percent = z.number().finite().min(0).max(99);
const rateInputSchema = z
  .object({
    annualSalary: amount.positive(),
    benefitsPercent: percent.optional(),
    reservePercent: percent.optional(),
    billableWeeks: z.number().finite().min(1).max(52).optional(),
    billableHoursPerWeek: z.number().finite().min(1).max(80).optional(),
    hoursPerDay: z.number().finite().min(1).max(24).optional(),
  })
  .strict();
const runwayInputSchema = z
  .object({
    liquidCash: amount,
    monthlyExpenses: amount,
    monthlyIncome: amount.optional(),
    oneTimeCosts: amount.optional(),
  })
  .strict();
const progressSchema = z.object({
  stage: z.literal("done"),
  done: z.literal(1),
  total: z.literal(1),
});
const rateAssumptionsSchema = z.object({
  annualSalary: z.number(),
  benefitsPercent: z.number(),
  reservePercent: z.number(),
  billableWeeks: z.number(),
  billableHoursPerWeek: z.number(),
  hoursPerDay: z.number(),
});
const runwayAssumptionsSchema = z.object({
  liquidCash: z.number(),
  monthlyExpenses: z.number(),
  monthlyIncome: z.number(),
  oneTimeCosts: z.number(),
});
export const rateOutputSchema = z.object({
  tab: z.literal("money"),
  kind: z.literal("rate"),
  annualTarget: z.number(),
  monthlyTarget: z.number(),
  hourlyRate: z.number(),
  dayRate: z.number(),
  assumptions: rateAssumptionsSchema,
  progress: progressSchema,
});
export const runwayOutputSchema = z.object({
  tab: z.literal("money"),
  kind: z.literal("runway"),
  usableCash: z.number(),
  monthlyBurn: z.number(),
  runwayMonths: z.number().nullable(),
  sustainable: z.boolean(),
  assumptions: runwayAssumptionsSchema,
  progress: progressSchema,
});
export type RateOutput = z.infer<typeof rateOutputSchema>;
export type RunwayOutput = z.infer<typeof runwayOutputSchema>;

function validated<T extends z.ZodType>(
  schema: T,
  action: (args: z.infer<T>, ctx: ToolContext) => Promise<ToolResult>,
): ToolDef["handler"] {
  return async (args, ctx) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return fail("INVALID_INPUT", "Check the calculator assumptions and try again.");
    }
    return action(parsed.data, ctx);
  };
}

const progress = { stage: "done" as const, done: 1 as const, total: 1 as const };

export const calculatorTools: ToolDef[] = [
  {
    name: "calc_rate",
    title: "Calculate a contract rate",
    description:
      "Use this to estimate hourly, day, monthly, and annual contract revenue that replaces a salary under explicit benefits, tax/overhead reserve, and billable-time assumptions. Do not use it as tax, legal, or financial advice or to infer the person's finances. Next, show the assumptions and let the person adjust them.",
    input: rateInputSchema.shape,
    output: rateOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Running the rate math…", invoked: "Rate estimate ready." },
    opensPanel: true,
    handler: validated(rateInputSchema, async (args) => {
      const result = calculateRate(args);
      return ok(
        `Estimated contract target: $${result.hourlyRate.toFixed(2)}/hour or $${result.dayRate.toFixed(2)}/day.`,
        { tab: "money" as const, kind: "rate" as const, ...result, progress },
      );
    }),
  },
  {
    name: "calc_runway",
    title: "Calculate financial runway",
    description:
      "Use this to estimate how many months liquid cash covers after one-time costs and recurring income. Do not use it as financial advice or assume expenses the person did not provide. Next, show the monthly burn and assumptions before discussing options.",
    input: runwayInputSchema.shape,
    output: runwayOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Calculating runway…", invoked: "Runway estimate ready." },
    opensPanel: true,
    handler: validated(runwayInputSchema, async (args) => {
      const result = calculateRunway(args);
      const text = result.sustainable
        ? "Recurring income currently covers the entered monthly expenses."
        : `Estimated runway: ${result.runwayMonths?.toFixed(2)} months at the entered monthly gap.`;
      return ok(text, { tab: "money" as const, kind: "runway" as const, ...result, progress });
    }),
  },
];
