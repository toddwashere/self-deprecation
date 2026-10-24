import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../env";
import type { DecisionRequest } from "../../lib/decisions";
import { assessLadder, heuristicAssessment, type LadderAnswers } from "./service";

const enabledEnv = { DECISIONS_ENABLED: "1" } as Env;
const assessedAnswers: LadderAnswers = {
  tooling: 3,
  delegation: 3,
  verification: 2,
  parallelism: 1,
  automation: 1,
  specification: 3,
  review: 4,
};

function validDecision(request: DecisionRequest) {
  return {
    answers: request.questions.map((question) =>
      question.type === "choice"
        ? {
            type: "choice" as const,
            name: question.name,
            choice: "3",
            confidence: 0.8,
            probabilities: [{ value: "3", probability: 0.8 }],
          }
        : question.type === "score"
          ? {
              type: "score" as const,
              name: question.name,
              score: 2,
              confidence: 0.8,
              probabilities: [],
            }
          : { type: "refusal" as const, name: question.name },
    ),
    usage: { input_tokens: 30 },
  };
}

describe("T8 ladder heuristic", () => {
  it.each([
    {
      name: "manual workflow",
      answers: {
        tooling: 0,
        delegation: 0,
        verification: 0,
        parallelism: 0,
        automation: 0,
        specification: 0,
        review: 0,
      },
      dimensions: { tooling: 0, delegation: 0, verification: 0, parallelism: 0, automation: 0 },
      level: 1,
    },
    {
      name: "agent driver with disciplined review",
      answers: {
        tooling: 3,
        delegation: 3,
        verification: 2,
        parallelism: 1,
        automation: 1,
        specification: 3,
        review: 4,
      },
      dimensions: { tooling: 3, delegation: 3, verification: 3, parallelism: 1, automation: 1 },
      level: 3,
    },
    {
      name: "loop builder",
      answers: {
        tooling: 4,
        delegation: 4,
        verification: 4,
        parallelism: 4,
        automation: 4,
        specification: 4,
        review: 4,
      },
      dimensions: { tooling: 4, delegation: 4, verification: 4, parallelism: 4, automation: 4 },
      level: 5,
    },
  ])("maps $name to hand-derived dimensions and level", ({ answers, dimensions, level }) => {
    expect(heuristicAssessment(answers as LadderAnswers)).toEqual({
      level,
      levelP: [1, 2, 3, 4, 5].map((candidate) => (candidate === level ? 1 : 0)),
      dimensionScores: dimensions,
      source: "heuristic",
    });
  });

  it("retains the reservation when metering fails after a Decisions response", async () => {
    const complete = vi.fn(async () => {
      throw new Error("D1 write failed");
    });
    const release = vi.fn(async () => undefined);

    const result = await assessLadder(enabledEnv, assessedAnswers, {
      decide: async (request) => validDecision(request),
      reserveUsage: async () => ({ complete, release }),
    });

    expect(result.source).toBe("heuristic");
    expect(complete).toHaveBeenCalledWith(30);
    expect(release).not.toHaveBeenCalled();
  });

  it("bounds failed-request cleanup and falls back while retaining a stalled reservation", async () => {
    vi.useFakeTimers();
    const release = vi.fn(() => new Promise<void>(() => undefined));
    const result = assessLadder(enabledEnv, assessedAnswers, {
      decide: async () => {
        throw new Error("upstream failed before responding");
      },
      reserveUsage: async () => ({ complete: async () => undefined, release }),
    });
    const settled = expect(result).resolves.toMatchObject({ source: "heuristic" });

    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    expect(release).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
