import type { DB } from "../db/client";
import type { Env } from "../env";
import { getDecisionUnitsSince, recordDecisionUsage } from "../features/scoring/repo";

export interface FitInput {
  jobId: string;
  jobText: string;
}

export interface FitResult {
  jobId: string;
  score: number | null;
  seniorityP?: number;
  stackP?: number;
  confidence?: number;
  source: "decisions" | "heuristic";
}

export interface HeuristicProfile {
  targetTitles?: string[];
  skills?: string[];
  seniority?: string;
}

export interface HeuristicJob {
  jobId: string;
  title: string;
  text: string;
}

interface ScoreQuestion {
  type: "score";
  name: string;
  instructions: Array<{ type: "input_text"; text: string }>;
  levels: Array<{ label: string; description: string }>;
}

interface PredicateQuestion {
  type: "predicate";
  name: string;
  instructions: Array<{ type: "input_text"; text: string }>;
}

interface ChoiceQuestion {
  type: "choice";
  name: string;
  instructions: Array<{ type: "input_text"; text: string }>;
  choices: Array<{ value: string | boolean; description?: string }>;
}

export interface DecisionRequest {
  model: "gpt-6-luna";
  input: Array<{
    role: "user";
    content: Array<
      { type: "input_text"; text: string } | { type: "input_json"; data: Record<string, unknown> }
    >;
  }>;
  questions: Array<ScoreQuestion | PredicateQuestion | ChoiceQuestion>;
}

export interface DecisionResponse {
  answers: Array<
    | {
        type: "score";
        name: string | null;
        score: number;
        confidence: number;
        probabilities: unknown[];
      }
    | { type: "predicate"; name: string | null; probability: number }
    | {
        type: "choice";
        name: string | null;
        choice: string | boolean;
        confidence: number;
        probabilities: Array<{ value: string | boolean; probability: number }>;
      }
    | { type: "refusal"; name: string | null }
  >;
  usage: { input_tokens: number };
}

export type Decide = (request: DecisionRequest, signal: AbortSignal) => Promise<DecisionResponse>;

export class DecisionExecutionError extends Error {
  readonly phase: "request" | "usage";

  constructor(phase: "request" | "usage", message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DecisionExecutionError";
    this.phase = phase;
  }
}

interface BoundedDecisionOptions {
  decide?: Decide;
  timeoutMs?: number;
  recordUsage?: (inputTokens: number) => Promise<void>;
}

interface ScoreFitOptions {
  db: DB;
  userId: string;
  decide?: Decide;
  now?: () => Date;
  timeoutMs?: number;
}

const LEVELS = [
  {
    label: "Poor fit",
    description: "Wrong role family or seniority, or violates hard preferences.",
  },
  {
    label: "Weak fit",
    description: "Same field but major mismatches in seniority, stack, or location.",
  },
  { label: "Plausible fit", description: "Reasonable match with notable gaps." },
  {
    label: "Strong fit",
    description: "Matches role, seniority, most of the stack, and preferences.",
  },
  {
    label: "Excellent fit",
    description: "Near-ideal role, seniority, stack, location, and compensation.",
  },
] as const;

function integerSetting(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function profileData(profileText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(profileText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // Plain-text profiles are a supported fallback.
  }
  return { profileText: profileText.slice(0, 2_000) };
}

function profileForHeuristic(profileText: string): HeuristicProfile {
  const data = profileData(profileText);
  return {
    targetTitles: Array.isArray(data.targetTitles) ? data.targetTitles.map(String) : [],
    skills: Array.isArray(data.skills)
      ? data.skills.map(String)
      : (profileText.toLowerCase().match(/[a-z+#.]{2,}/g) ?? []),
    seniority: typeof data.seniority === "string" ? data.seniority : undefined,
  };
}

export function heuristicFit(profile: HeuristicProfile, job: HeuristicJob): FitResult {
  const haystack = `${job.title} ${job.text}`.toLowerCase();
  const skills = [...new Set((profile.skills ?? []).map((skill) => skill.toLowerCase()))];
  const skillOverlap = skills.length
    ? skills.filter((skill) => haystack.includes(skill)).length / skills.length
    : 0;
  const titleMatch = (profile.targetTitles ?? []).some((title) => {
    const words = title
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3);
    return (
      words.length > 0 &&
      words.filter((word) => haystack.includes(word)).length >= Math.ceil(words.length / 2)
    );
  });
  const seniorityMatch = profile.seniority
    ? haystack.includes(profile.seniority.toLowerCase())
    : false;
  const score = Math.round(
    Math.min(100, 20 + skillOverlap * 55 + (titleMatch ? 20 : 0) + (seniorityMatch ? 5 : 0)),
  );
  return { jobId: job.jobId, score, source: "heuristic" };
}

function fallbackBatch(profileText: string, jobs: FitInput[]): FitResult[] {
  const profile = profileForHeuristic(profileText);
  return jobs.map((job) =>
    heuristicFit(profile, {
      jobId: job.jobId,
      title: job.jobText.slice(0, 160),
      text: job.jobText,
    }),
  );
}

function makeRequest(profileText: string, jobs: FitInput[]): DecisionRequest {
  return {
    model: "gpt-6-luna",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Evaluate each job for this candidate. Use role, seniority, skills, location, and compensation evidence.",
          },
          { type: "input_json", data: profileData(profileText) },
        ],
      },
    ],
    questions: jobs.flatMap((job, index) => [
      {
        type: "score" as const,
        name: `fit_${index}`,
        levels: [...LEVELS],
        instructions: [
          {
            type: "input_text" as const,
            text: `How well does this job fit the candidate?\n\n${job.jobText}`,
          },
        ],
      },
      {
        type: "predicate" as const,
        name: `senior_${index}`,
        instructions: [
          {
            type: "input_text" as const,
            text: `Is this role at or near the candidate's target seniority?\n\n${job.jobText}`,
          },
        ],
      },
    ]),
  };
}

function mapAnswers(
  profileText: string,
  jobs: FitInput[],
  response: DecisionResponse,
): FitResult[] {
  const answers = new Map(response.answers.map((answer) => [answer.name, answer]));
  return jobs.map((job, index) => {
    const fit = answers.get(`fit_${index}`);
    const seniority = answers.get(`senior_${index}`);
    if (fit?.type !== "score") return fallbackBatch(profileText, [job])[0];
    return {
      jobId: job.jobId,
      score: Math.round((Math.max(0, Math.min(4, fit.score)) / 4) * 100),
      ...(seniority?.type === "predicate" ? { seniorityP: seniority.probability } : {}),
      confidence: fit.confidence,
      source: "decisions",
    };
  });
}

async function defaultDecide(
  apiKey: string,
  request: DecisionRequest,
  signal: AbortSignal,
): Promise<DecisionResponse> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  return client.decisions.create(request, { signal }) as unknown as Promise<DecisionResponse>;
}

export async function runBoundedDecision(
  env: Env,
  request: DecisionRequest,
  options: BoundedDecisionOptions = {},
): Promise<DecisionResponse> {
  if (env.DECISIONS_ENABLED !== "1") throw new Error("Decisions disabled");
  const timeoutMs = Math.min(6_000, Math.max(1_000, options.timeoutMs ?? 6_000));
  const decide =
    options.decide ?? ((input, signal) => defaultDecide(env.OPENAI_API_KEY, input, signal));
  const signal = AbortSignal.timeout(timeoutMs);
  let phase: DecisionExecutionError["phase"] = "request";
  let rejectTimeout: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = () => reject(new DecisionExecutionError(phase, "Decisions timed out"));
    if (signal.aborted) rejectTimeout();
    else signal.addEventListener("abort", rejectTimeout, { once: true });
  });
  const operation = (async () => {
    try {
      const response = await decide(request, signal);
      phase = "usage";
      await options.recordUsage?.(response.usage.input_tokens);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Decisions failed";
      throw new DecisionExecutionError(phase, message, error);
    }
  })();
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (rejectTimeout) signal.removeEventListener("abort", rejectTimeout);
  }
}

export async function smokeScoreBatch(
  apiKey: string,
  profileText: string,
  jobs: FitInput[],
): Promise<FitResult[]> {
  const response = await defaultDecide(
    apiKey,
    makeRequest(profileText, jobs),
    AbortSignal.timeout(15_000),
  );
  return mapAnswers(profileText, jobs, response);
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const output: T[] = new Array(tasks.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        output[index] = await tasks[index]();
      }
    }),
  );
  return output;
}

export async function scoreFit(
  env: Env,
  profileText: string,
  jobs: FitInput[],
  options: ScoreFitOptions,
): Promise<FitResult[]> {
  if (!jobs.length) return [];
  if (env.DECISIONS_ENABLED !== "1") return fallbackBatch(profileText, jobs);

  const now = (options.now ?? (() => new Date()))();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dailyCap = integerSetting(env.DECISIONS_DAILY_JOB_CAP, 300, 0, 100_000);
  const used = await getDecisionUnitsSince(options.db, options.userId, dayStart);
  const allowed = Math.max(0, dailyCap - used);
  const apiJobs = jobs.slice(0, allowed);
  const cappedJobs = jobs.slice(allowed);
  if (!apiJobs.length) return fallbackBatch(profileText, jobs);

  const batchSize = integerSetting(env.DECISIONS_BATCH_SIZE, 20, 1, 200);
  const concurrency = integerSetting(env.DECISIONS_CONCURRENCY, 3, 1, 10);
  const batches = Array.from({ length: Math.ceil(apiJobs.length / batchSize) }, (_, index) =>
    apiJobs.slice(index * batchSize, (index + 1) * batchSize),
  );
  const decide =
    options.decide ?? ((request, signal) => defaultDecide(env.OPENAI_API_KEY, request, signal));
  const timeoutMs = Math.min(15_000, Math.max(1_000, options.timeoutMs ?? 15_000));

  const scored = await runPool(
    batches.map((batch) => async () => {
      try {
        const response = await decide(
          makeRequest(profileText, batch),
          AbortSignal.timeout(timeoutMs),
        );
        await recordDecisionUsage(
          options.db,
          options.userId,
          batch.length,
          response.usage.input_tokens,
          now.getTime(),
        );
        return mapAnswers(profileText, batch, response);
      } catch {
        return fallbackBatch(profileText, batch);
      }
    }),
    concurrency,
  );
  return [...scored.flat(), ...fallbackBatch(profileText, cappedJobs)];
}

export function jobDigest(job: {
  title: string;
  company: string;
  location?: string | null;
  remote?: boolean | null;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  tags?: string[];
  descriptionText?: string | null;
}): string {
  const compensation =
    job.salaryMin || job.salaryMax
      ? `${job.currency ?? "USD"} ${job.salaryMin ?? "?"}-${job.salaryMax ?? "?"}`
      : "not listed";
  return [
    `${job.title} at ${job.company}`,
    `Location: ${job.location ?? "unknown"}; remote: ${job.remote ?? "unknown"}`,
    `Employment: ${job.employmentType ?? "unknown"}; compensation: ${compensation}`,
    `Tags: ${(job.tags ?? []).slice(0, 12).join(", ")}`,
    (job.descriptionText ?? "").slice(0, 1_000),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_500);
}
