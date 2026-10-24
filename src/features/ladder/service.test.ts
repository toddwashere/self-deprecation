import { describe, expect, it } from "vitest";
import { heuristicAssessment, type LadderAnswers } from "./service";

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
});
