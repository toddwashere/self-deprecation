import { z } from "zod";

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
export const jobsOutputSchema = z.object({
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
