import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import { apiUsage, users } from "../db/schema";
import type { Env } from "../env";
import {
  type DecisionRequest,
  type FitInput,
  heuristicFit,
  runBoundedDecision,
  scoreFit,
} from "./decisions";

interface TestEnv extends Env {
  TEST_MIGRATIONS: D1Migration[];
}

const boundEnv = env as unknown as TestEnv;
const db = createDb(boundEnv.DB);
const jobs: FitInput[] = Array.from({ length: 5 }, (_, index) => ({
  jobId: `job-${index}`,
  jobText: `Senior TypeScript engineer ${index} building reliable APIs`,
}));

beforeAll(async () => {
  await applyD1Migrations(boundEnv.DB, boundEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await db.delete(apiUsage);
  await db.delete(users);
  await db.insert(users).values([
    { id: "user-a", createdAt: 1, updatedAt: 1 },
    { id: "user-b", createdAt: 1, updatedAt: 1 },
  ]);
});

function scoringEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...boundEnv,
    DECISIONS_ENABLED: "1",
    DECISIONS_BATCH_SIZE: "2",
    DECISIONS_CONCURRENCY: "2",
    DECISIONS_DAILY_JOB_CAP: "10",
    ...overrides,
  };
}

describe("Decisions scoring", () => {
  it("runs a typed choice assessment within six seconds and meters only a successful call", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const recordUsage = vi.fn(async () => undefined);
    const decide = vi.fn(async (_request: DecisionRequest, signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return {
        answers: [
          {
            type: "choice" as const,
            name: "level",
            choice: "3",
            confidence: 0.8,
            probabilities: [{ value: "3", probability: 0.8 }],
          },
        ],
        usage: { input_tokens: 42 },
      };
    });
    const request: DecisionRequest = {
      model: "gpt-6-luna",
      input: [{ role: "user", content: [{ type: "input_json", data: { tooling: 3 } }] }],
      questions: [
        {
          type: "choice",
          name: "level",
          instructions: [{ type: "input_text", text: "Choose the best supported level." }],
          choices: [
            { value: "1", description: "Artisan" },
            { value: "3", description: "Agent Driver" },
          ],
        },
      ],
    };

    const result = await runBoundedDecision(scoringEnv(), request, {
      decide,
      timeoutMs: 9_000,
      recordUsage,
    });

    expect(result.answers[0]).toMatchObject({ type: "choice", choice: "3" });
    expect(timeout).toHaveBeenCalledWith(6_000);
    expect(recordUsage).toHaveBeenCalledWith(42);
    timeout.mockRestore();
  });

  it("honors the kill switch and does not meter a failed request", async () => {
    const decide = vi.fn(async () => {
      throw new Error("outage");
    });
    const recordUsage = vi.fn(async () => undefined);
    const request: DecisionRequest = {
      model: "gpt-6-luna",
      input: [{ role: "user", content: [{ type: "input_text", text: "assessment" }] }],
      questions: [
        {
          type: "choice",
          name: "level",
          instructions: [{ type: "input_text", text: "Choose a level." }],
          choices: [{ value: "1" }, { value: "2" }],
        },
      ],
    };

    await expect(
      runBoundedDecision(scoringEnv({ DECISIONS_ENABLED: "0" }), request, {
        decide,
        recordUsage,
      }),
    ).rejects.toThrow("Decisions disabled");
    expect(decide).not.toHaveBeenCalled();
    await expect(
      runBoundedDecision(scoringEnv(), request, { decide, recordUsage }),
    ).rejects.toMatchObject({ message: "outage", phase: "request" });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("bounds usage persistence within the same deadline as the Decisions call", async () => {
    vi.useFakeTimers();
    const request: DecisionRequest = {
      model: "gpt-6-luna",
      input: [{ role: "user", content: [{ type: "input_text", text: "assessment" }] }],
      questions: [
        {
          type: "choice",
          name: "level",
          instructions: [{ type: "input_text", text: "Choose a level." }],
          choices: [{ value: "1" }, { value: "2" }],
        },
      ],
    };
    const decide = vi.fn(async () => ({
      answers: [
        {
          type: "choice" as const,
          name: "level",
          choice: "2",
          confidence: 0.8,
          probabilities: [{ value: "2", probability: 0.8 }],
        },
      ],
      usage: { input_tokens: 20 },
    }));
    const recordUsage = vi.fn(() => new Promise<void>(() => undefined));

    const result = runBoundedDecision(scoringEnv(), request, {
      decide,
      timeoutMs: 1_000,
      recordUsage,
    });
    const rejection = expect(result).rejects.toMatchObject({
      message: "Decisions timed out",
      phase: "usage",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(decide).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(20);
    vi.useRealTimers();
  });

  it("batches, maps names to job IDs, scales 0–4, and isolates a failed batch", async () => {
    let callIndex = 0;
    const decide = vi.fn(async (request: DecisionRequest) => {
      const index = callIndex++;
      if (index === 1) throw new Error("simulated outage");
      const fitNames = request.questions
        .filter((question) => question.type === "score")
        .map((q) => q.name);
      if (index === 2) {
        return {
          answers: [{ type: "refusal" as const, name: fitNames[0] }],
          usage: { input_tokens: 10 },
        };
      }
      return {
        answers: fitNames
          .flatMap((name, answerIndex) => [
            { type: "predicate" as const, name: name.replace("fit_", "senior_"), probability: 0.8 },
            {
              type: "score" as const,
              name,
              score: answerIndex === 0 ? 4 : 2,
              confidence: 0.75,
              probabilities: [],
            },
          ])
          .reverse(),
        usage: { input_tokens: 40 },
      };
    });

    const result = await scoreFit(scoringEnv(), JSON.stringify({ skills: ["typescript"] }), jobs, {
      db,
      userId: "user-a",
      decide,
      now: () => new Date("2026-10-24T06:00:00Z"),
    });

    expect(decide).toHaveBeenCalledTimes(3);
    expect(decide.mock.calls.map(([request]) => request.questions.length)).toEqual([4, 4, 2]);
    expect(result.map((item) => item.jobId)).toEqual(jobs.map((job) => job.jobId));
    expect(result[0]).toMatchObject({
      jobId: "job-0",
      score: 100,
      seniorityP: 0.8,
      source: "decisions",
    });
    expect(result[1]).toMatchObject({ jobId: "job-1", score: 50, source: "decisions" });
    expect(result.slice(2, 4).map((item) => item.source)).toEqual(["heuristic", "heuristic"]);
    expect(result[4]).toMatchObject({ jobId: "job-4", source: "heuristic" });
  });

  it("enforces the daily cap per user", async () => {
    await db.insert(apiUsage).values([
      {
        id: "usage-a",
        userId: "user-a",
        api: "decisions",
        units: 2,
        inputTokens: 10,
        createdAt: 1_799_999_999_000,
      },
      {
        id: "usage-b",
        userId: "user-b",
        api: "decisions",
        units: 100,
        inputTokens: 10,
        createdAt: 1_799_999_999_000,
      },
    ]);
    const decide = vi.fn(async (request: DecisionRequest) => ({
      answers: request.questions.map((question) =>
        question.type === "score"
          ? {
              type: "score" as const,
              name: question.name,
              score: 3,
              confidence: 0.6,
              probabilities: [],
            }
          : { type: "predicate" as const, name: question.name, probability: 0.7 },
      ),
      usage: { input_tokens: 20 },
    }));

    const result = await scoreFit(
      scoringEnv({ DECISIONS_DAILY_JOB_CAP: "3" }),
      "typescript",
      jobs.slice(0, 3),
      {
        db,
        userId: "user-a",
        decide,
        now: () => new Date(1_800_000_000_000),
      },
    );

    expect(decide).toHaveBeenCalledTimes(1);
    expect(result.map((item) => item.source)).toEqual(["decisions", "heuristic", "heuristic"]);
    const usage = await db.select().from(apiUsage).where(eq(apiUsage.userId, "user-a"));
    expect(usage.reduce((sum, row) => sum + row.units, 0)).toBe(3);
  });

  it("uses a plausible deterministic heuristic when Decisions is disabled", async () => {
    const strong = heuristicFit(
      {
        targetTitles: ["Senior Software Engineer"],
        skills: ["typescript", "postgres"],
        seniority: "senior",
      },
      { jobId: "strong", title: "Senior Software Engineer", text: "TypeScript Postgres APIs" },
    );
    const weak = heuristicFit(
      {
        targetTitles: ["Senior Software Engineer"],
        skills: ["typescript", "postgres"],
        seniority: "senior",
      },
      { jobId: "weak", title: "Junior Designer", text: "Figma and illustration" },
    );
    expect(strong.score).toBeGreaterThan(weak.score ?? 0);
    expect(strong.source).toBe("heuristic");
  });

  it("uses the caller's bounded Decisions timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const decide = vi.fn(async (request: DecisionRequest) => ({
      answers: request.questions.map((question) =>
        question.type === "score"
          ? {
              type: "score" as const,
              name: question.name,
              score: 3,
              confidence: 0.8,
              probabilities: [],
            }
          : { type: "predicate" as const, name: question.name, probability: 0.7 },
      ),
      usage: { input_tokens: 20 },
    }));

    await scoreFit(scoringEnv(), "typescript", jobs.slice(0, 1), {
      db,
      userId: "user-a",
      decide,
      now: () => new Date("2026-10-24T06:00:00Z"),
      timeoutMs: 6_000,
    });

    expect(timeout).toHaveBeenCalledWith(6_000);
    timeout.mockRestore();
  });
});
