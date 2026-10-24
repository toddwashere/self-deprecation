import type { Env } from "../../env";
import {
  type Decide,
  DecisionExecutionError,
  type DecisionRequest,
  type DecisionResponse,
  runBoundedDecision,
} from "../../lib/decisions";
import { DIMENSIONS, type LadderDimension } from "./quests";

const CLEANUP_TIMEOUT_MS = 250;

export interface LadderAnswers {
  tooling: number;
  delegation: number;
  verification: number;
  parallelism: number;
  automation: number;
  specification: number;
  review: number;
  workflow?: string;
}

export interface LadderAssessmentResult {
  level: number;
  levelP: number[];
  dimensionScores: Record<LadderDimension, number>;
  source: "decisions" | "heuristic";
}

const levelChoices = [
  { value: "1", description: "Artisan: writes nearly all code by hand." },
  { value: "2", description: "Pair Programmer: uses AI chat for snippets and explanations." },
  { value: "3", description: "Agent Driver: delegates complete repository tasks to one agent." },
  { value: "4", description: "Parallel Orchestrator: plans and verifies concurrent agents." },
  { value: "5", description: "Loop Builder: builds scheduled, evaluated agent systems." },
];
const scoreLevels = [0, 1, 2, 3, 4].map((score) => ({
  label: String(score),
  description: `${score} of 4 maturity for this dimension`,
}));

function boundedScore(value: number) {
  return Math.min(4, Math.max(0, Math.round(value)));
}

export function heuristicAssessment(answers: LadderAnswers): LadderAssessmentResult {
  const dimensionScores = {
    tooling: boundedScore(answers.tooling),
    delegation: boundedScore((answers.delegation + answers.specification) / 2),
    verification: boundedScore((answers.verification + answers.review) / 2),
    parallelism: boundedScore(answers.parallelism),
    automation: boundedScore(answers.automation),
  };
  const average =
    Object.values(dimensionScores).reduce((total, score) => total + score, 0) / DIMENSIONS.length;
  const level = Math.min(5, Math.max(1, Math.round(average) + 1));
  return {
    level,
    levelP: [1, 2, 3, 4, 5].map((candidate) => (candidate === level ? 1 : 0)),
    dimensionScores,
    source: "heuristic",
  };
}

function requestFor(answers: LadderAnswers): DecisionRequest {
  return {
    model: "gpt-6-luna",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Assess the demonstrated AI-native engineering workflow. Prefer observable habits over aspirational language.",
          },
          { type: "input_json", data: { ...answers } },
        ],
      },
    ],
    questions: [
      {
        type: "choice",
        name: "level",
        instructions: [{ type: "input_text", text: "Which level is best supported overall?" }],
        choices: levelChoices,
      },
      ...DIMENSIONS.map((dimension) => ({
        type: "score" as const,
        name: dimension,
        instructions: [
          {
            type: "input_text" as const,
            text: `Score the ${dimension} maturity demonstrated by these answers.`,
          },
        ],
        levels: scoreLevels,
      })),
    ],
  };
}

function mapDecision(response: DecisionResponse): LadderAssessmentResult | undefined {
  const answers = new Map(response.answers.map((answer) => [answer.name, answer]));
  const levelAnswer = answers.get("level");
  if (levelAnswer?.type !== "choice") return undefined;
  const level = Number(levelAnswer.choice);
  if (!Number.isInteger(level) || level < 1 || level > 5) return undefined;
  const dimensionScores = {} as Record<LadderDimension, number>;
  for (const dimension of DIMENSIONS) {
    const answer = answers.get(dimension);
    if (answer?.type !== "score") return undefined;
    dimensionScores[dimension] = boundedScore(answer.score);
  }
  const levelP = [1, 2, 3, 4, 5].map((candidate) => {
    const probability = levelAnswer.probabilities.find(
      (item) => Number(item.value) === candidate,
    )?.probability;
    return probability === undefined ? 0 : Math.min(1, Math.max(0, probability));
  });
  return { level, levelP, dimensionScores, source: "decisions" };
}

async function releaseWithinBudget(release: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      release(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // The reservation remains conservative when cleanup fails.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function assessLadder(
  env: Env,
  answers: LadderAnswers,
  options: {
    decide?: Decide;
    reserveUsage: () => Promise<
      | {
          complete: (inputTokens: number) => Promise<void>;
          release: () => Promise<void>;
        }
      | undefined
    >;
  },
): Promise<LadderAssessmentResult> {
  const fallback = heuristicAssessment(answers);
  if (env.DECISIONS_ENABLED !== "1") return fallback;
  let reservation: Awaited<ReturnType<typeof options.reserveUsage>>;
  try {
    reservation = await options.reserveUsage();
  } catch {
    return fallback;
  }
  if (!reservation) return fallback;
  try {
    const response = await runBoundedDecision(env, requestFor(answers), {
      decide: options.decide,
      timeoutMs: 6_000,
      recordUsage: reservation.complete,
    });
    return mapDecision(response) ?? fallback;
  } catch (error) {
    // Only a known pre-response failure is safe to release. Once a response exists,
    // metering failure must retain the reservation so paid calls cannot escape the cap.
    if (error instanceof DecisionExecutionError && error.phase === "request") {
      await releaseWithinBudget(reservation.release);
    }
    return fallback;
  }
}
