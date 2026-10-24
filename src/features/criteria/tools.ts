import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { type CriteriaPatch, getCriteria, saveResume, updateCriteria } from "./repo";

const senioritySchema = z.enum(["junior", "mid", "senior", "staff", "principal", "manager"]);
const remotePrefSchema = z.enum(["remote", "hybrid", "onsite", "any"]);
const employmentTypeSchema = z.enum(["full_time", "contract", "part_time"]);
const stringList = z.array(z.string().trim().min(1).max(100)).max(50);
const avoidSchema = z.object({
  companies: stringList,
  industries: stringList,
  keywords: stringList,
});

export const criteriaOutputSchema = z.object({
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  targetTitles: z.array(z.string()),
  seniority: z.string().nullable(),
  locations: z.array(z.string()),
  remotePref: z.string().nullable(),
  salaryMin: z.number().int().nullable(),
  hourlyMin: z.number().int().nullable(),
  employmentTypes: z.array(z.string()),
  skills: z.array(z.string()),
  avoid: avoidSchema,
  bridgeMode: z.boolean(),
  timezone: z.string(),
  hasResume: z.boolean(),
  resumeUpdatedAt: z.number().int().nullable(),
  criteriaVersion: z.number().int().positive(),
  resumeText: z.string().optional(),
});

export type CriteriaOutput = z.infer<typeof criteriaOutputSchema>;

const updateFields = {
  headline: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().max(2_000).nullable().optional(),
  targetTitles: stringList.optional(),
  seniority: senioritySchema.nullable().optional(),
  locations: stringList.optional(),
  remotePref: remotePrefSchema.nullable().optional(),
  salaryMin: z.number().int().nonnegative().max(2_000_000).nullable().optional(),
  hourlyMin: z.number().int().nonnegative().max(10_000).nullable().optional(),
  employmentTypes: z.array(employmentTypeSchema).max(3).optional(),
  skills: stringList.optional(),
  avoid: z
    .object({
      companies: stringList.optional(),
      industries: stringList.optional(),
      keywords: stringList.optional(),
    })
    .optional(),
  bridgeMode: z.boolean().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
};

const updateInputSchema = z.object(updateFields);
const resumeInput = {
  text: z.string().min(1).max(50_000),
  extracted: z
    .object({
      skills: stringList.optional(),
      titles: stringList.optional(),
      seniority: senioritySchema.optional(),
      summary: z.string().trim().max(2_000).optional(),
    })
    .optional(),
};
const resumeInputSchema = z.object(resumeInput);
const questionGroupSchema = z.object({ id: z.string(), prompt: z.string() });
const onboardingOutputSchema = z.object({
  tab: z.literal("profile"),
  configured: z.boolean(),
  criteria: criteriaOutputSchema,
  missing: z.array(z.string()),
  questionGroups: z.array(questionGroupSchema).max(6),
});
export const productTourOutputSchema = z.object({
  tab: z.literal("profile"),
  mode: z.literal("tour"),
  configured: z.boolean(),
});

export type ProductTourOutput = z.infer<typeof productTourOutputSchema>;

function onboardingState(criteria: CriteriaOutput) {
  const configured = criteria.targetTitles.length > 0 || criteria.skills.length > 0;
  const missing = [
    ...(criteria.targetTitles.length ? [] : ["targetTitles"]),
    ...(criteria.seniority ? [] : ["seniority"]),
    ...(criteria.remotePref || criteria.locations.length ? [] : ["workMode"]),
    ...(criteria.salaryMin !== null || criteria.hourlyMin !== null ? [] : ["compensation"]),
    ...(criteria.skills.length ? [] : ["skills"]),
    ...(criteria.avoid.companies.length ||
    criteria.avoid.industries.length ||
    criteria.avoid.keywords.length
      ? []
      : ["avoid"]),
    ...(!configured && !criteria.bridgeMode ? ["bridgeMode"] : []),
  ];
  const questionGroups = configured
    ? []
    : [
        {
          id: "roles",
          prompt: "What roles are you considering, and at what seniority?",
        },
        {
          id: "workplace",
          prompt: "Do you prefer remote, hybrid, or onsite work, and in which locations?",
        },
        {
          id: "compensation",
          prompt:
            "What minimum salary should I use, and what hourly floor if contract work is open?",
        },
        { id: "skills", prompt: "Which skills or technologies should your next role use?" },
        {
          id: "avoid",
          prompt: "Any companies, industries, or keywords you want to avoid?",
        },
        {
          id: "bridge",
          prompt: "Should Bridge mode include contract work while you search?",
        },
      ];
  return { tab: "profile" as const, configured, criteria, missing, questionGroups };
}

function invalidInput(message: string) {
  return fail("INVALID_INPUT", message, "No criteria were changed.");
}

export const criteriaTools: ToolDef[] = [
  {
    name: "start_onboarding",
    title: "Start job-search onboarding",
    description:
      "Use this when someone asks to get started, set up their job search, or needs criteria before another Self-Deprecation task. Do not use it when they only want connection diagnostics. Next, ask the returned question groups one or two at a time, summarize the answers, confirm, then call update_criteria.",
    input: {},
    output: onboardingOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: {
      invoking: "Loading your search profile…",
      invoked: "Setup ready.",
    },
    opensPanel: true,
    handler: async (_args, ctx) => {
      const criteria = await getCriteria(ctx.db, ctx.userId);
      const state = onboardingState(criteria);
      return ok(
        state.configured
          ? "Criteria already exist. Summarize them and ask what the person wants to change."
          : "Begin onboarding. Ask the returned questions one or two at a time, then summarize and confirm before saving.",
        state,
      );
    },
  },
  {
    name: "get_criteria",
    title: "Get job-search criteria",
    description:
      "Use this to read the signed-in person's current job-search profile and criteria. Do not request resume text unless the current task truly needs it. Next, summarize the criteria or call start_onboarding when target roles and skills are empty.",
    input: { includeResume: z.boolean().optional() },
    output: criteriaOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Loading your search profile…", invoked: "Search profile loaded." },
    handler: async (args, ctx) => {
      const parsed = z.object({ includeResume: z.boolean().optional() }).safeParse(args);
      if (!parsed.success) return invalidInput("Criteria options are invalid.");
      const criteria = await getCriteria(ctx.db, ctx.userId, parsed.data.includeResume ?? false);
      return ok("Loaded your current job-search criteria.", { ...criteria });
    },
  },
  {
    name: "update_criteria",
    title: "Update job-search criteria",
    description:
      "Use this after the signed-in person confirms new or changed job-search criteria. Do not invent missing experience, compensation, location, or preferences. Next, summarize what was saved and open the Profile tab or search jobs when that tool is available.",
    input: updateFields,
    output: criteriaOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    status: { invoking: "Saving your search preferences…", invoked: "Search preferences saved." },
    handler: async (args, ctx) => {
      const parsed = updateInputSchema.safeParse(args);
      if (!parsed.success) return invalidInput("One or more criteria values are invalid.");
      if (Object.keys(parsed.data).length === 0) {
        return invalidInput("Provide at least one criterion to update.");
      }
      const criteria = await updateCriteria(
        ctx.db,
        ctx.userId,
        parsed.data as CriteriaPatch,
        ctx.now().getTime(),
      );
      return ok("Your job-search criteria were updated.", { ...criteria });
    },
  },
  {
    name: "save_resume",
    title: "Save resume for matching",
    description:
      "Use this only when the signed-in person shares resume text and wants it saved for job matching; include extracted fields only when supported by that resume. Do not use it to store unrelated documents or inferred facts. Next, summarize the extracted criteria and ask the person to correct anything inaccurate.",
    input: resumeInput,
    output: criteriaOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    status: { invoking: "Saving your resume…", invoked: "Resume saved." },
    handler: async (args, ctx) => {
      const parsed = resumeInputSchema.safeParse(args);
      if (!parsed.success) {
        return invalidInput("Resume text must be between 1 and 50,000 characters.");
      }
      const criteria = await saveResume(
        ctx.db,
        ctx.userId,
        parsed.data.text,
        parsed.data.extracted,
        ctx.now().getTime(),
      );
      return ok("Your resume and supported extracted criteria were saved.", { ...criteria });
    },
  },
  {
    name: "show_product_tour",
    title: "Show the Self-Deprecation tour",
    description:
      "Use this when someone asks what Self-Deprecation does, wants a guided tour, or is presenting the product. Do not use it to change job-search criteria or load demo data. Next, let the person choose Set up my search or View demo from the tour.",
    input: {},
    output: productTourOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Opening the product tour…", invoked: "Tour ready." },
    opensPanel: true,
    handler: async (_args, ctx) => {
      const criteria = await getCriteria(ctx.db, ctx.userId);
      const configured = criteria.targetTitles.length > 0 || criteria.skills.length > 0;
      return ok(
        "The product tour is open. Let the person choose whether to set up their search or view the public demo.",
        { tab: "profile" as const, mode: "tour" as const, configured },
      );
    },
  },
];
