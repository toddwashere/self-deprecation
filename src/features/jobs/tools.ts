import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { getCatalogJob, getJobMatch, getScoringProfile, setJobStatus } from "../scoring/repo";
import { jobCard, runJobSearch } from "../scoring/service";

export const jobStatusSchema = z.enum([
  "new",
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "dismissed",
]);
export const jobCardSchema = z.object({
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
export const jobSearchFiltersSchema = z.object({
  query: z.string(),
  status: jobStatusSchema.or(z.literal("")),
  employmentType: z.enum(["full_time", "contract", "part_time", "unknown", ""]),
  remoteOnly: z.boolean(),
  hideUnlistedSalary: z.boolean(),
  limit: z.number().int().min(1).max(60),
});
export type JobSearchFilters = z.infer<typeof jobSearchFiltersSchema>;
export const jobsOutputSchema = z.object({
  filters: jobSearchFiltersSchema,
  tab: z.literal("jobs"),
  jobs: z.array(jobCardSchema),
  criteriaVersion: z.number().int(),
  fallback: z.boolean(),
  progress: z.object({
    stage: z.enum(["filtering", "scoring", "done"]),
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
export const jobOutputSchema = z.object({ tab: z.literal("jobs"), job: jobCardSchema });
export type JobCard = z.infer<typeof jobCardSchema>;
export type JobsOutput = z.infer<typeof jobsOutputSchema>;
export type JobOutput = z.infer<typeof jobOutputSchema>;

const searchInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    status: jobStatusSchema.optional(),
    employmentType: z.enum(["full_time", "contract", "part_time", "unknown"]).optional(),
    remoteOnly: z.boolean().optional(),
    hideUnlistedSalary: z.boolean().optional(),
    limit: z.number().int().min(1).max(60).optional(),
  })
  .strict();
const jobInputSchema = z.object({ jobId: z.string().min(1).max(200) }).strict();
const statusInputSchema = jobInputSchema.extend({ status: jobStatusSchema });

function validated<T extends z.ZodType>(
  schema: T,
  action: (args: z.infer<T>, ctx: ToolContext) => Promise<ToolResult>,
): ToolDef["handler"] {
  return async (args, ctx) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success)
      return fail("INVALID_INPUT", "Check the job filters or job ID and try again.");
    try {
      return await action(parsed.data, ctx);
    } catch {
      return fail("INTERNAL", "Jobs could not be loaded.", "Try again in a moment.");
    }
  };
}

async function detail(jobId: string, ctx: ToolContext): Promise<JobCard | undefined> {
  const job = await getCatalogJob(ctx.db, jobId);
  if (!job) return undefined;
  const [profile, match] = await Promise.all([
    getScoringProfile(ctx.db, ctx.userId),
    getJobMatch(ctx.db, ctx.userId, jobId),
  ]);
  return jobCard(
    job,
    profile ?? {
      targetTitles: [],
      seniority: null,
      skills: [],
      locations: [],
      remotePref: null,
      salaryMin: null,
      employmentTypes: [],
      avoid: { companies: [], industries: [], keywords: [] },
      criteriaVersion: 0,
      summary: null,
      headline: null,
      resumeText: null,
      extra: null,
    },
    match,
  );
}

const searchHandler = validated(searchInputSchema, async (args, ctx) => {
  const result = await runJobSearch(ctx, args, { limit: args.limit });
  return result
    ? ok(
        `Found ${result.jobs.length} jobs. ${result.progress.done} of ${result.progress.total} scored.${result.fallback ? " Keyword scoring is in use." : ""}${result.progress.stage !== "done" ? " Call score_jobs with the same filters for the next batch." : ""}`,
        result,
      )
    : fail(
        "NEEDS_CRITERIA",
        "Set your job criteria before searching.",
        "Use update_criteria or the onboarding skill, then search_jobs.",
      );
});

export const jobsTools: ToolDef[] = [
  {
    name: "search_jobs",
    title: "Search ranked jobs",
    description:
      "Find jobs that pass the signed-in person's criteria, ranked by cached fit score; scores one bounded batch if needed. Use for matching roles, with optional query, status, employment and salary filters. Do not use to fetch job boards or change criteria. Next, call score_jobs with the same filters while progress is scoring, then get_job or update_job_status for a result.",
    input: searchInputSchema.shape,
    output: jobsOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    status: {
      invoking: "Asking the robots to rank your jobs…",
      invoked: "Ranked. Still employable.",
    },
    opensPanel: true,
    handler: searchHandler,
  },
  {
    name: "get_job",
    title: "Get job details",
    description:
      "Read a public job posting and only the signed-in person's fit score, reasons and saved status. Use when inspecting a specific search result or preparing for it. Do not use to search by title or change status. Next, save the job with update_job_status or prepare for its interview.",
    input: jobInputSchema.shape,
    output: jobOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Opening the job details…", invoked: "Job details ready." },
    opensPanel: true,
    handler: validated(jobInputSchema, async (args, ctx) => {
      const job = await detail(args.jobId, ctx);
      return job
        ? ok(`${job.title} at ${job.company}.`, { tab: "jobs", job })
        : fail("NOT_FOUND", "That job was not found.", "Search jobs again for current postings.");
    }),
  },
  {
    name: "update_job_status",
    title: "Update job status",
    description:
      "Save, dismiss or track application progress for a job in the signed-in person's workspace. Use when the person asks to change this job's status. Do not use to edit the public posting or infer that they applied. Next, show the updated Jobs card or offer interview prep for a saved job.",
    input: statusInputSchema.shape,
    output: jobOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: { invoking: "Updating your job list…", invoked: "Job status saved." },
    handler: validated(statusInputSchema, async (args, ctx) => {
      const job = await getCatalogJob(ctx.db, args.jobId);
      if (!job)
        return fail(
          "NOT_FOUND",
          "That job was not found.",
          "Search jobs again for current postings.",
        );
      const profile = await getScoringProfile(ctx.db, ctx.userId);
      await setJobStatus(
        ctx.db,
        ctx.userId,
        args.jobId,
        args.status,
        profile?.criteriaVersion ?? 1,
        ctx.now().getTime(),
      );
      const updated = await detail(args.jobId, ctx);
      return ok(`Job marked ${args.status}.`, { tab: "jobs", job: updated });
    }),
  },
  {
    name: "score_jobs",
    title: "Score next job batch",
    description:
      "Score the next unscored batch of eligible jobs for the current criteria and return ranked results plus progress. Use after search_jobs reports scoring in progress, preserving its filters. Do not use to force rescoring cached results or refresh job feeds. Next, repeat while progress is scoring, or inspect and save a ranked match.",
    input: searchInputSchema.shape,
    output: jobsOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    status: { invoking: "Scoring the next batch…", invoked: "Scores ready. Keep moving." },
    opensPanel: true,
    handler: searchHandler,
  },
];
