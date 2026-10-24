import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { markBriefSeen, readBrief } from "./repo";

const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const match = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  location: z.string().nullable(),
  employmentType: z.string(),
  fitScore: z.number().nullable(),
  reasons: z.array(z.string()),
  scoredAt: timestamp.nullable(),
});
const progressSchema = z.object({
  stage: z.enum(["done", "awaiting_scoring"]),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  taskId: z.string().optional(),
});
const taskSchema = z.object({
  taskId: z.string(),
  status: z.literal("running"),
  progress: z.object({
    stage: z.string(),
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
export const briefOutputSchema = z.object({
  tab: z.literal("today"),
  asOf: timestamp,
  lastSeenAt: timestamp.nullable(),
  timezone: z.string(),
  needsCriteria: z.boolean(),
  matches: z.array(match),
  contractLeads: z.array(match),
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().nullable(),
      startsAt: timestamp.nullable(),
      city: z.string().nullable(),
      venue: z.string().nullable(),
      status: z.string(),
    }),
  ),
  followUps: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      company: z.string().nullable(),
      followUpAt: timestamp.nullable(),
    }),
  ),
  headlines: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      source: z.string(),
      publishedAt: timestamp.nullable(),
      fetchedAt: timestamp,
    }),
  ),
  unavailable: z.array(z.enum(["matches", "contractLeads", "events", "followUps", "headlines"])),
  progress: progressSchema,
});
export const seenOutputSchema = z.object({ tab: z.literal("today"), lastSeenAt: timestamp });
export type BriefOutput = z.infer<typeof briefOutputSchema>;
export type SeenOutput = z.infer<typeof seenOutputSchema>;
const seenInput = { asOf: timestamp };
export const briefTools: ToolDef[] = [
  {
    name: "get_brief_data",
    title: "Get daily brief data",
    description:
      "Read the caller's stored new job matches and contract leads since the last viewed brief, upcoming events, due follow-ups, and five public AI headlines. Use for a daily brief or Today dashboard. Do not use to refresh feeds, score jobs, or schedule delivery. Next: summarize ready sections with links, acknowledge unavailable sections and any awaiting_scoring state (which requires a score_jobs call to advance), then mark_brief_seen with this result's asOf after the user reads a brief with no unavailable sections.",
    input: {},
    output: briefOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: {
      invoking: "Compiling your career release notes…",
      invoked: "Brief ready. Pick one next step.",
    },
    opensPanel: true,
    async handler(args, ctx) {
      if (!z.strictObject({}).safeParse(args).success)
        return fail(
          "INVALID_INPUT",
          "This tool takes no arguments.",
          "Call get_brief_data with an empty object.",
        );
      try {
        const { task, ...data } = await readBrief(ctx.db, ctx.userId, ctx.now().getTime());
        const pending = taskSchema.safeParse(task);
        const progress =
          pending.success && pending.data.progress.done < pending.data.progress.total
            ? {
                ...pending.data.progress,
                stage: "awaiting_scoring" as const,
                taskId: pending.data.taskId,
              }
            : { stage: "done" as const, done: 5 - data.unavailable.length, total: 5 };
        return ok(
          `${data.matches.length} new matches, ${data.events.length} upcoming events, ${data.followUps.length} follow-ups due, ${data.headlines.length} headlines.${data.unavailable.length ? " Some sections are unavailable." : ""}`,
          { tab: "today", ...data, progress },
        );
      } catch {
        return fail(
          "INTERNAL",
          "Your brief could not be loaded.",
          "Retry in a moment; your last-seen time has not changed.",
        );
      }
    },
  },
  {
    name: "mark_brief_seen",
    title: "Mark daily brief seen",
    description:
      "Advance the caller's last-seen brief watermark to the asOf timestamp of a brief they read. Use only after presenting or explicitly marking that snapshot read. Do not use before a brief is shown, for an incomplete brief with unavailable sections, or with the current time substituted for its asOf. Next: confirm the brief was marked read and offer one practical next action.",
    input: seenInput,
    output: seenOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: { invoking: "Saving your place…", invoked: "Place saved. Keep moving forward." },
    async handler(args, ctx) {
      const parsed = z.strictObject(seenInput).safeParse(args);
      const now = ctx.now().getTime();
      if (!parsed.success || parsed.data.asOf > now)
        return fail(
          "INVALID_INPUT",
          "Supply the viewed brief's asOf timestamp.",
          "Use a nonnegative epoch-millisecond timestamp no later than now.",
        );
      try {
        return ok("Brief marked read.", {
          tab: "today",
          lastSeenAt: await markBriefSeen(ctx.db, ctx.userId, parsed.data.asOf, now),
        });
      } catch {
        return fail(
          "INTERNAL",
          "Your reading position could not be saved.",
          "Retry marking this brief read.",
        );
      }
    },
  },
];
