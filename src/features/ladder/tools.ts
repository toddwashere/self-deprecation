import { z } from "zod";
import type { Decide } from "../../lib/decisions";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { questsForLevel } from "./quests";
import {
  getLadderDecisionUnitsSince,
  getLatestAssessment,
  listAssessments,
  listQuestStates,
  recordLadderDecisionUsage,
  saveAssessment,
  updateQuestState,
} from "./repo";
import { assessLadder } from "./service";

const score = z.number().int().min(0).max(4);
const assessmentInputSchema = z
  .object({
    tooling: score,
    delegation: score,
    verification: score,
    parallelism: score,
    automation: score,
    specification: score,
    review: score,
    workflow: z.string().trim().max(2_000).optional(),
  })
  .strict();
const assessmentSchema = z.object({
  id: z.string(),
  level: z.number().int().min(1).max(5),
  levelP: z.array(z.number().min(0).max(1)).length(5),
  dimensionScores: z.record(z.string(), z.number().min(0).max(4)),
  source: z.enum(["decisions", "heuristic"]),
  createdAt: z.number().int(),
});
const questSchema = z.object({
  questId: z.string(),
  level: z.number().int().min(2).max(5),
  dimension: z.enum(["tooling", "delegation", "verification", "parallelism", "automation"]),
  title: z.string(),
  description: z.string(),
  status: z.enum(["todo", "done"]),
  evidence: z.string().nullable(),
  completedAt: z.number().int().nullable(),
});
export const ladderOutputSchema = z.object({
  tab: z.literal("level"),
  assessment: assessmentSchema.nullable(),
  quests: z.array(questSchema),
  history: z.array(assessmentSchema),
  fallback: z.boolean().optional(),
});
export type LadderOutput = z.infer<typeof ladderOutputSchema>;

const updateInputSchema = z
  .object({
    questId: z.string().trim().min(1).max(100),
    status: z.enum(["todo", "done"]),
    evidence: z.string().trim().max(2_000).optional(),
  })
  .strict();
const invalid = () =>
  fail(
    "INVALID_INPUT",
    "The ladder assessment input is invalid.",
    "Use scores from 0 to 4 and keep optional notes under 2,000 characters.",
  );
const missing = () =>
  fail(
    "NOT_FOUND",
    "That ladder assessment or active quest is unavailable.",
    "Run the AI-native assessment, then choose one of its current quests.",
  );

function dayStart(now: number) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

async function view(ctx: Parameters<ToolDef["handler"]>[1]): Promise<LadderOutput> {
  const [rawAssessment, rawHistory, states] = await Promise.all([
    getLatestAssessment(ctx.db, ctx.userId),
    listAssessments(ctx.db, ctx.userId),
    listQuestStates(ctx.db, ctx.userId),
  ]);
  const normalizeAssessment = (assessment: NonNullable<typeof rawAssessment>) => ({
    ...assessment,
    source: assessment.source === "decisions" ? ("decisions" as const) : ("heuristic" as const),
  });
  const assessment = rawAssessment ? normalizeAssessment(rawAssessment) : null;
  const history = rawHistory.map(normalizeAssessment);
  const byId = new Map(states.map((state) => [state.questId, state]));
  const quests = assessment
    ? questsForLevel(assessment.level).map((quest) => {
        const state = byId.get(quest.questId);
        return {
          ...quest,
          status: state?.status === "done" ? ("done" as const) : ("todo" as const),
          evidence: state?.evidence ?? null,
          completedAt: state?.completedAt ?? null,
        };
      })
    : [];
  return { tab: "level", assessment: assessment ?? null, quests, history };
}

export function createLadderTools(options: { decide?: Decide } = {}): ToolDef[] {
  return [
    {
      name: "assess_ai_level",
      title: "Assess AI-native engineering level",
      description:
        "Use this after collecting the seven scored workflow answers and optional context to assess the signed-in person's AI-native level, dimensions and next quests. Do not infer answers from a resume or score another person. Next, show the Level panel and offer a practical plan for one quest.",
      input: assessmentInputSchema.shape,
      output: ladderOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      status: {
        invoking: "Measuring your AI-native level…",
        invoked: "Level computed. Next quest ready.",
      },
      opensPanel: true,
      handler: async (args, ctx) => {
        const parsed = assessmentInputSchema.safeParse(args);
        if (!parsed.success) return invalid();
        const now = ctx.now().getTime();
        const result = await assessLadder(ctx.env, parsed.data, {
          decide: options.decide,
          usedToday: await getLadderDecisionUnitsSince(ctx.db, ctx.userId, dayStart(now)),
          recordUsage: (tokens) => recordLadderDecisionUsage(ctx.db, ctx.userId, tokens, now),
        });
        await saveAssessment(ctx.db, ctx.userId, { ...result, answers: parsed.data }, now);
        const output = await view(ctx);
        return ok(
          result.source === "decisions"
            ? "Your AI-native level and next quests are ready."
            : "Your level is ready from the local rubric; Decisions was unavailable or capped.",
          { ...output, fallback: result.source === "heuristic" },
        );
      },
    },
    {
      name: "get_ladder",
      title: "Get AI-native ladder progress",
      description:
        "Use this to read the signed-in person's latest AI-native assessment, history and current quests. Do not use it to assess new answers or inspect another person. Next, show progress or suggest reassessment when no result exists.",
      input: {},
      output: ladderOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      status: { invoking: "Loading your migration path…", invoked: "Ladder progress ready." },
      opensPanel: true,
      handler: async (args, ctx) => {
        if (!z.object({}).strict().safeParse(args).success) return invalid();
        const output = await view(ctx);
        return ok(
          output.assessment
            ? "Loaded your latest level, active quests and assessment history."
            : "No AI-native assessment is saved yet. Start the level-up skill to establish a baseline.",
          output,
        );
      },
    },
    {
      name: "update_quest",
      title: "Update an AI-native quest",
      description:
        "Use this to mark one current ladder quest todo or done and optionally save the signed-in person's evidence. Do not update arbitrary or inactive quest IDs. Next, show updated progress and recommend the next unfinished quest.",
      input: updateInputSchema.shape,
      output: ladderOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      status: { invoking: "Saving quest progress…", invoked: "Quest progress saved." },
      opensPanel: true,
      handler: async (args, ctx) => {
        const parsed = updateInputSchema.safeParse(args);
        if (!parsed.success) return invalid();
        const assessment = await getLatestAssessment(ctx.db, ctx.userId);
        const quest = assessment
          ? questsForLevel(assessment.level).find(
              (candidate) => candidate.questId === parsed.data.questId,
            )
          : undefined;
        if (!assessment || !quest) return missing();
        await updateQuestState(
          ctx.db,
          ctx.userId,
          quest.questId,
          quest.level,
          parsed.data.status,
          parsed.data.evidence ?? null,
          ctx.now().getTime(),
        );
        return ok(
          "Quest progress saved. Keep the evidence short and useful to future you.",
          await view(ctx),
        );
      },
    },
  ];
}

export const ladderTools = createLadderTools();
