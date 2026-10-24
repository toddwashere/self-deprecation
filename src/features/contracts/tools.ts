import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { CONTRACT_COPY as copy } from "./copy";
import { getBridgeProfile, listContractLeads, setBridgeMode } from "./repo";

const jobStatusSchema = z.enum([
  "new",
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "dismissed",
]);
const jobSchema = z.object({
  id: z.string(),
  source: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  remote: z.boolean().nullable(),
  employmentType: z.string(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  currency: z.string().nullable(),
  url: z.string(),
  descriptionText: z.string().nullable(),
  tags: z.array(z.string()),
  postedAt: z.number().nullable(),
  fetchedAt: z.number(),
  fitScore: z.number().int().min(0).max(100).nullable(),
  scoreSource: z.enum(["decisions", "heuristic"]).nullable(),
  reasons: z.array(z.string()),
  status: jobStatusSchema,
  scoredAt: z.number().nullable(),
});
const normalizedFiltersSchema = z.object({
  query: z.string(),
  status: z.literal(""),
  employmentType: z.literal("contract"),
  remoteOnly: z.boolean(),
  hideUnlistedSalary: z.boolean(),
  limit: z.number().int().min(1).max(60),
});
export const contractLeadsOutputSchema = z.object({
  tab: z.literal("jobs"),
  bridgeMode: z.literal(true),
  filters: normalizedFiltersSchema,
  jobs: z.array(jobSchema),
  criteriaVersion: z.number().int().positive(),
  fallback: z.literal(false),
  progress: z.object({
    stage: z.literal("done"),
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  taskId: z.string(),
  sources: z.array(
    z.object({
      source: z.string(),
      status: z.string(),
      lastSuccessAt: z.number().nullable(),
      lastFetchAt: z.number(),
    }),
  ),
});
const bridgeOutputSchema = z.object({
  tab: z.literal("jobs"),
  bridgeMode: z.boolean(),
  criteriaVersion: z.number().int().positive(),
});
const setSchema = z.object({ enabled: z.boolean() }).strict();
const listSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    remoteOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(60).optional(),
  })
  .strict();

function validated<T extends z.ZodType>(
  schema: T,
  action: (args: z.infer<T>, ctx: ToolContext) => Promise<ToolResult>,
): ToolDef["handler"] {
  return async (args, ctx) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success)
      return fail("INVALID_INPUT", "Check the Bridge mode options and try again.");
    try {
      return await action(parsed.data, ctx);
    } catch {
      return fail("INTERNAL", "Contract leads could not be loaded.", "Try again in a moment.");
    }
  };
}

export const contractTools: ToolDef[] = [
  {
    name: "set_bridge_mode",
    title: "Set Bridge mode",
    description:
      "Turn temporary contract-work matching on or off for the signed-in person's search. Use after the person explicitly chooses Bridge mode. Do not use it to infer financial need or change other criteria. Next, call list_contract_leads when enabled or continue the full-time job search when disabled.",
    input: setSchema.shape,
    output: bridgeOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: { invoking: copy.enabling, invoked: copy.enabled },
    handler: validated(setSchema, async ({ enabled }, ctx) => {
      const state = await setBridgeMode(ctx.db, ctx.userId, enabled, ctx.now().getTime());
      return ok(
        enabled
          ? "Bridge mode is on. Include contract leads while the longer migration continues."
          : "Bridge mode is off. Continue with the primary job search.",
        { tab: "jobs" as const, ...state },
      );
    }),
  },
  {
    name: "list_contract_leads",
    title: "List contract leads",
    description:
      "List public contract and freelance leads with only the signed-in person's saved status and fit evidence. Use when Bridge mode is on and the person wants temporary contract work. Do not use it for full-time-only searches or to refresh Hacker News. Next, inspect a lead in Jobs, save it, or narrow the query.",
    input: listSchema.shape,
    output: contractLeadsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: copy.loading, invoked: copy.loaded },
    opensPanel: true,
    handler: validated(listSchema, async (args, ctx) => {
      const profile = await getBridgeProfile(ctx.db, ctx.userId);
      if (!profile.bridgeMode) return fail("NEEDS_CRITERIA", copy.off, copy.offHint);
      const filters = {
        query: args.query ?? "",
        status: "" as const,
        employmentType: "contract" as const,
        remoteOnly: args.remoteOnly ?? false,
        hideUnlistedSalary: false,
        limit: args.limit ?? 40,
      };
      const result = await listContractLeads(ctx.db, ctx.userId, filters);
      const progress = {
        stage: "done" as const,
        done: result.jobs.length,
        total: result.jobs.length,
      };
      return ok(
        result.jobs.length
          ? `Found ${result.jobs.length} contract leads. Open Jobs to inspect or save one.`
          : "No contract leads match yet. The next source refresh may add more.",
        {
          tab: "jobs" as const,
          bridgeMode: true as const,
          filters,
          jobs: result.jobs,
          criteriaVersion: result.profile.criteriaVersion,
          fallback: false as const,
          progress,
          taskId: `contracts-v${result.profile.criteriaVersion}`,
          sources: result.sources,
        },
      );
    }),
  },
];
