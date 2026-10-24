import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import {
  getOwnedJob,
  getPrepContext,
  listInterviewIntel,
  saveInterviewIntel,
  savePrep,
} from "./repo";

const text = z.string().trim().min(1).max(2_000);
const label = z.string().trim().min(1).max(200);
const id = z.string().trim().min(1).max(200);
const url = z
  .url()
  .max(2_000)
  .refine((value) => /^https?:\/\//i.test(value), "Use a public HTTP or HTTPS URL.");
const sourceUrls = z.array(url).max(20);
const lines = z.array(text).max(30);

export const interviewReportSchema = z
  .object({
    company: label,
    role: label.optional(),
    stages: z
      .array(
        z.object({
          name: label,
          description: text,
          durationMinutes: z.number().int().positive().max(1_440).optional(),
          sourceUrls,
        }),
      )
      .max(20),
    coding: z.object({
      patterns: z
        .array(
          z.object({
            name: label,
            difficulty: label,
            practiceLinks: z.array(z.object({ title: label, url })).max(10),
            sourceUrls,
          }),
        )
        .max(20),
      languages: z.array(label).max(20),
      format: text,
    }),
    systemDesign: z.object({ prompts: lines, expectedDepth: text, sourceUrls }),
    behavioral: z.object({ themes: lines, sourceUrls }),
    tips: lines,
    redFlags: lines,
    confidence: z.enum(["high", "medium", "low"]),
    sources: z
      .array(z.object({ title: label, url, date: z.iso.date().nullable() }))
      .min(1)
      .max(30),
    lastResearchedAt: z.number().int().nonnegative(),
  })
  .superRefine((report, ctx) => {
    const citations = new Set(report.sources.map((source) => source.url));
    const references = [
      ...report.stages.flatMap((stage) => stage.sourceUrls),
      ...report.coding.patterns.flatMap((pattern) => pattern.sourceUrls),
      ...report.systemDesign.sourceUrls,
      ...report.behavioral.sourceUrls,
    ];
    if (references.some((reference) => !citations.has(reference)))
      ctx.addIssue({ code: "custom", message: "Every source URL must appear in sources." });
    if (JSON.stringify(report).length > 50_000)
      ctx.addIssue({ code: "custom", message: "Report must fit in 50,000 characters." });
  });
export type InterviewReport = z.infer<typeof interviewReportSchema>;
const intelRecordSchema = z.object({
  id: z.string(),
  report: interviewReportSchema,
  updatedAt: z.number().int(),
});
export const intelOutputSchema = z.object({
  tab: z.literal("prep"),
  intel: z.array(intelRecordSchema),
});
const prepSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  title: z.string(),
  body: z.string(),
  updatedAt: z.number().int(),
});
export const prepOutputSchema = z.object({ tab: z.literal("prep"), prep: prepSchema });
export const prepContextOutputSchema = z.object({
  tab: z.literal("prep"),
  savedJobs: z.array(
    z.object({
      id: z.string(),
      company: z.string(),
      title: z.string(),
      status: z.string(),
      prepStatus: z.enum(["ready", "not_started"]),
    }),
  ),
  job: z
    .object({
      id: z.string(),
      company: z.string(),
      title: z.string(),
      descriptionText: z.string().nullable(),
      status: z.string(),
      tags: z.array(z.string()),
    })
    .nullable(),
  profile: z.object({
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    skills: z.array(z.string()),
    seniority: z.string().nullable(),
    targetTitles: z.array(z.string()),
  }),
  relatedNotes: z.array(
    z.object({ id: z.string(), title: z.string().nullable(), body: z.string().nullable() }),
  ),
  prep: z.array(prepSchema),
  intel: z.array(intelRecordSchema),
  progress: z.object({ stage: z.literal("done"), done: z.number().int(), total: z.number().int() }),
});
export type PrepContextOutput = z.infer<typeof prepContextOutputSchema>;
export type IntelOutput = z.infer<typeof intelOutputSchema>;
export type IntelRecord = z.infer<typeof intelRecordSchema>;

function decodeIntel(rows: Awaited<ReturnType<typeof listInterviewIntel>>): IntelRecord[] {
  return rows.flatMap((row) => {
    try {
      const parsed = interviewReportSchema.safeParse(JSON.parse(row.body ?? ""));
      return parsed.success ? [{ id: row.id, report: parsed.data, updatedAt: row.updatedAt }] : [];
    } catch {
      return [];
    }
  });
}
const notFound = () =>
  fail(
    "NOT_FOUND",
    "This saved job or prep note is unavailable.",
    "Choose a job saved in your account, then try again.",
  );
const invalid = () =>
  fail(
    "INVALID_INPUT",
    "The prep or interview report input is invalid.",
    "Use bounded text, cited public HTTP(S) sources, and a research date no later than today.",
  );
const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const contextInput = { jobId: id.optional() };
const prepInput = {
  jobId: id,
  noteId: id.optional(),
  title: label,
  body: z.string().trim().min(1).max(50_000),
};
const intelInput = { company: label.optional(), jobId: id.optional(), role: label.optional() };
const saveIntelInput = { jobId: id.optional(), report: interviewReportSchema };

export const prepTools: ToolDef[] = [
  {
    name: "get_prep_context",
    title: "Get interview prep context",
    description:
      "Use this to list saved jobs or load one saved job, your compact profile, related notes, prep and saved company interview intel before preparing or practicing. Do not use it to search public jobs or research the web. Next, use saved intel to build a study plan, research missing intel with interview-intel, or run a mock interview; save the result with save_prep.",
    input: contextInput,
    output: prepContextOutputSchema,
    annotations: readAnnotations,
    status: { invoking: "Loading your interview unit tests…", invoked: "Prep context ready." },
    opensPanel: true,
    handler: async (args, ctx) => {
      const parsed = z.object(contextInput).safeParse(args);
      if (!parsed.success) return invalid();
      const context = await getPrepContext(ctx.db, ctx.userId, parsed.data.jobId);
      if (!context) return notFound();
      const intel = decodeIntel(await listInterviewIntel(ctx.db, ctx.userId, context.job?.company));
      return ok(
        "Loaded your saved interview prep context. Research any missing or stale company intel before making claims about the interview loop.",
        { tab: "prep", ...context, intel, progress: { stage: "done", done: 1, total: 1 } },
      );
    },
  },
  {
    name: "save_prep",
    title: "Save interview prep",
    description:
      "Use this to save a study plan or mock-interview summary for a job in the signed-in person's matches; supply noteId to revise their existing prep. Do not invent qualifications or store confidential interview questions. Next, show the saved plan and offer one focused practice session.",
    input: prepInput,
    output: prepOutputSchema,
    annotations: writeAnnotations,
    status: {
      invoking: "Saving your interview migration guide…",
      invoked: "Prep saved. Practice is next.",
    },
    opensPanel: true,
    handler: async (args, ctx) => {
      const parsed = z.object(prepInput).safeParse(args);
      if (!parsed.success) return invalid();
      const prep = await savePrep(ctx.db, ctx.userId, parsed.data, ctx.now().getTime());
      return prep ? ok("Your interview prep was saved.", { tab: "prep", prep }) : notFound();
    },
  },
  {
    name: "save_interview_intel",
    title: "Save cited company interview intel",
    description:
      "Use this after ChatGPT web research to save a paraphrased, cited company/role interview report: stages, coding patterns with practice links, design and behavioral themes, tips, red flags, confidence and research date. Replaces the caller's report for the same company/role. Do not scrape, reproduce confidential or paywalled text, or claim exact future questions. Next, show the Interview loop card and build a study plan or mock from its patterns.",
    input: saveIntelInput,
    output: intelOutputSchema,
    annotations: writeAnnotations,
    status: { invoking: "Filing the interview intel…", invoked: "Intel saved." },
    opensPanel: true,
    handler: async (args, ctx) => {
      const parsed = z.object(saveIntelInput).safeParse(args);
      if (!parsed.success || parsed.data.report.lastResearchedAt > ctx.now().getTime())
        return invalid();
      if (parsed.data.jobId) {
        const job = await getOwnedJob(ctx.db, ctx.userId, parsed.data.jobId);
        if (!job) return notFound();
        if (job.company.trim().toLowerCase() !== parsed.data.report.company.trim().toLowerCase())
          return invalid();
      }
      const intel = await saveInterviewIntel(
        ctx.db,
        ctx.userId,
        parsed.data.report,
        ctx.now().getTime(),
      );
      return ok(
        "Cited interview intel saved. Reported patterns are guidance, not guaranteed interview questions.",
        { tab: "prep", intel: [intel] },
      );
    },
  },
  {
    name: "get_interview_intel",
    title: "Get saved company interview intel",
    description:
      "Use this to read the signed-in person's stored company interview intel by company, saved job, optional role, or list all reports without a selector. Do not treat old reports as current or use this instead of web research when intel is missing. Next, cite its sources and confidence, refresh stale or thin evidence with interview-intel, or practice the saved patterns.",
    input: intelInput,
    output: intelOutputSchema,
    annotations: readAnnotations,
    status: { invoking: "Reading your saved interview intel…", invoked: "Interview intel loaded." },
    opensPanel: true,
    handler: async (args, ctx) => {
      const parsed = z.object(intelInput).safeParse(args);
      if (!parsed.success) return invalid();
      let company = parsed.data.company;
      if (parsed.data.jobId) {
        const job = await getOwnedJob(ctx.db, ctx.userId, parsed.data.jobId);
        if (!job) return notFound();
        if (company && company.trim().toLowerCase() !== job.company.trim().toLowerCase())
          return invalid();
        company = job.company;
      }
      const intel = decodeIntel(
        await listInterviewIntel(ctx.db, ctx.userId, company, parsed.data.role),
      );
      return ok(
        intel.length
          ? "Loaded your saved interview intel; check dates and confidence before using it."
          : "No cited interview intel is saved for this selection. Use ChatGPT web search through interview-intel to research it.",
        { tab: "prep", intel },
      );
    },
  },
];
