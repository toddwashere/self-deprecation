import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { MissingCriteriaError, refreshJobs } from "./service";

export const refreshOutputSchema = z.object({
  tab: z.literal("jobs"),
  snapshotCapturedAt: z.number().optional(),
  itemsUpserted: z.number().int().nonnegative(),
  sources: z.array(
    z.object({
      source: z.string(),
      status: z.enum(["ok", "error", "cached"]),
      itemsUpserted: z.number().int().nonnegative(),
      reason: z.string().optional(),
    }),
  ),
  progress: z.object({ stage: z.literal("done"), done: z.number().int(), total: z.number().int() }),
  fallback: z.boolean(),
  skipped: z.array(z.object({ source: z.string(), reason: z.string() })),
});
export type RefreshOutput = z.infer<typeof refreshOutputSchema>;

export const catalogTools: ToolDef[] = [
  {
    name: "refresh_jobs",
    title: "Refresh jobs",
    description:
      "Refresh up to three fast job sources using your saved criteria, including location search when configured. Use when you want newer job listings. Do not use to search or rank the stored catalog or to set criteria. Next call search_jobs to see matches; use start_onboarding first if criteria are missing.",
    input: {},
    output: refreshOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    status: { invoking: "Scanning job boards…", invoked: "Fresh jobs in" },
    opensPanel: true,
    async handler(_args, ctx) {
      try {
        const result = await refreshJobs(ctx);
        const failures = result.sources.filter((source) => source.status === "error").length;
        if (result.fallback)
          return ok(
            `Showing snapshot jobs captured ${new Date(result.snapshotCapturedAt ?? 0).toISOString().slice(0, 10)}. Search jobs to see matches; retry refresh for live listings.`,
            { ...result },
          );
        return ok(
          `${result.itemsUpserted} jobs refreshed.${failures ? ` ${failures} sources unavailable; stored listings remain available.` : ""} Search jobs to see your matches.`,
          { ...result },
        );
      } catch (error) {
        if (error instanceof MissingCriteriaError)
          return fail(
            "NEEDS_CRITERIA",
            "Set up your job criteria first.",
            "Use start_onboarding, then refresh jobs.",
          );
        return fail(
          "SOURCE_UNAVAILABLE",
          "Job refresh is unavailable.",
          "Search your stored jobs or retry shortly.",
        );
      }
    },
  },
];
