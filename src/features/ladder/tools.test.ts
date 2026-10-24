import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../db/client";
import { apiUsage, ladderAssessments, ladderQuests, users } from "../../db/schema";
import type { Env } from "../../env";
import type { DecisionRequest } from "../../lib/decisions";
import type { ToolContext } from "../../mcp/types";
import { createLadderTools } from "./tools";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
const now = Date.UTC(2026, 9, 24);
const answers = {
  tooling: 3,
  delegation: 3,
  verification: 2,
  parallelism: 1,
  automation: 1,
  specification: 3,
  review: 4,
  workflow: "I delegate features, review diffs, and run tests before merging.",
};

beforeAll(async () => applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(apiUsage);
  await db.delete(ladderQuests);
  await db.delete(ladderAssessments);
  await db.delete(users);
  await db.insert(users).values([
    { id: "ladder-a", createdAt: now, updatedAt: now },
    { id: "ladder-b", createdAt: now, updatedAt: now },
  ]);
});

function context(userId: string, enabled = "0"): ToolContext {
  return {
    db,
    userId,
    identity: { userId, name: userId },
    env: { ...bound, DECISIONS_ENABLED: enabled },
    now: () => new Date(now),
    log: { info() {}, warn() {}, error() {} },
  };
}
function findTool(tools: ReturnType<typeof createLadderTools>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool, `${name} registered`).toBeDefined();
  if (!tool) throw new Error(`Missing ${name}`);
  return tool;
}
function errorCode(
  result: Awaited<ReturnType<ReturnType<typeof createLadderTools>[number]["handler"]>>,
) {
  return (result._meta?.["self-deprecation/error"] as { code?: string } | undefined)?.code;
}

describe("ladder tools", () => {
  it("T1 keeps assessment history and quest updates isolated by the verified caller", async () => {
    const tools = createLadderTools();
    const assessed = await findTool(tools, "assess_ai_level").handler(answers, context("ladder-a"));
    expect(assessed.isError).not.toBe(true);
    expect(assessed.structuredContent).toMatchObject({
      tab: "level",
      assessment: { level: 3, source: "heuristic" },
      quests: [{ status: "todo" }, { status: "todo" }, { status: "todo" }],
      fallback: true,
    });
    const assessedQuests = (assessed.structuredContent?.quests ?? []) as Array<{ questId: string }>;
    expect(assessedQuests).toHaveLength(3);
    const questId = assessedQuests[0].questId;

    const otherView = await findTool(tools, "get_ladder").handler({}, context("ladder-b"));
    expect(otherView.structuredContent).toMatchObject({
      assessment: null,
      quests: [],
      history: [],
    });
    expect(
      errorCode(
        await findTool(tools, "update_quest").handler(
          { questId, status: "done", evidence: "https://example.com/private" },
          context("ladder-b"),
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(
      await db
        .select()
        .from(ladderQuests)
        .where(and(eq(ladderQuests.userId, "ladder-a"), eq(ladderQuests.questId, questId)))
        .get(),
    ).toBeUndefined();

    const updated = await findTool(tools, "update_quest").handler(
      { questId, status: "done", evidence: "Ran two agents and merged both worktrees." },
      context("ladder-a"),
    );
    expect(updated.structuredContent).toMatchObject({
      quests: expect.arrayContaining([
        expect.objectContaining({ questId, status: "done", completedAt: now }),
      ]),
    });
  });

  it("maps a typed Decisions assessment, records an independent unit, and validates contracts", async () => {
    const decide = vi.fn(async (request: DecisionRequest) => {
      expect(request.questions.map((question) => question.name)).toEqual([
        "level",
        "tooling",
        "delegation",
        "verification",
        "parallelism",
        "automation",
      ]);
      return {
        answers: [
          {
            type: "choice" as const,
            name: "level",
            choice: "4",
            confidence: 0.72,
            probabilities: [
              { value: "3", probability: 0.2 },
              { value: "4", probability: 0.72 },
              { value: "5", probability: 0.08 },
            ],
          },
          ...["tooling", "delegation", "verification", "parallelism", "automation"].map(
            (name, index) => ({
              type: "score" as const,
              name,
              score: [3, 4, 3, 4, 2][index],
              confidence: 0.8,
              probabilities: [],
            }),
          ),
        ],
        usage: { input_tokens: 77 },
      };
    });
    const tools = createLadderTools({ decide });
    const tool = findTool(tools, "assess_ai_level");
    const result = await tool.handler(answers, context("ladder-a", "1"));

    expect(result.structuredContent).toMatchObject({
      assessment: {
        level: 4,
        levelP: [0, 0, 0.2, 0.72, 0.08],
        dimensionScores: {
          tooling: 3,
          delegation: 4,
          verification: 3,
          parallelism: 4,
          automation: 2,
        },
        source: "decisions",
      },
      fallback: false,
    });
    expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
    expect(
      await db
        .select()
        .from(apiUsage)
        .where(and(eq(apiUsage.userId, "ladder-a"), eq(apiUsage.api, "decisions_ladder")))
        .get(),
    ).toMatchObject({ units: 1, inputTokens: 77 });
    expect(
      errorCode(await tool.handler({ ...answers, userId: "ladder-b" }, context("ladder-a"))),
    ).toBe("INVALID_INPUT");
    for (const candidate of tools) {
      expect(candidate.status.invoking.length).toBeLessThanOrEqual(64);
      expect(candidate.status.invoked.length).toBeLessThanOrEqual(64);
      expect(candidate.description).toContain("Use");
      expect(candidate.description).toContain("Do not");
      expect(candidate.description).toContain("Next");
    }
  });

  it("falls back after the three-run daily ladder cap without calling Decisions", async () => {
    await db.insert(apiUsage).values(
      [0, 1, 2].map((offset) => ({
        id: `usage-${offset}`,
        userId: "ladder-a",
        api: "decisions_ladder",
        units: 1,
        inputTokens: 20,
        createdAt: now,
      })),
    );
    const decide = vi.fn(async () => {
      throw new Error("must not run");
    });
    const result = await findTool(createLadderTools({ decide }), "assess_ai_level").handler(
      answers,
      context("ladder-a", "1"),
    );
    expect(result.structuredContent).toMatchObject({ fallback: true });
    expect(decide).not.toHaveBeenCalled();
  });

  it("preserves omitted quest evidence and clears it only with explicit null", async () => {
    const tools = createLadderTools();
    const assessed = await findTool(tools, "assess_ai_level").handler(answers, context("ladder-a"));
    const assessedQuests = (assessed.structuredContent?.quests ?? []) as Array<{ questId: string }>;
    expect(assessedQuests).toHaveLength(3);
    const questId = assessedQuests[0].questId;
    const update = findTool(tools, "update_quest");

    await update.handler(
      { questId, status: "done", evidence: "Merged two independently verified changes." },
      context("ladder-a"),
    );
    const statusOnly = await update.handler({ questId, status: "todo" }, context("ladder-a"));
    expect(statusOnly.structuredContent).toMatchObject({
      quests: expect.arrayContaining([
        expect.objectContaining({
          questId,
          status: "todo",
          evidence: "Merged two independently verified changes.",
        }),
      ]),
    });

    const cleared = await update.handler(
      { questId, status: "todo", evidence: null },
      context("ladder-a"),
    );
    expect(cleared.structuredContent).toMatchObject({
      quests: expect.arrayContaining([expect.objectContaining({ questId, evidence: null })]),
    });
  });

  it("atomically reserves at most three concurrent Decisions assessments per day", async () => {
    let releaseCalls: (() => void) | undefined;
    const callsMayFinish = new Promise<void>((resolve) => {
      releaseCalls = resolve;
    });
    let started = 0;
    const decide = vi.fn(async (request: DecisionRequest) => {
      started += 1;
      if (started === 3) releaseCalls?.();
      await callsMayFinish;
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
    });
    const assess = findTool(createLadderTools({ decide }), "assess_ai_level");

    const results = await Promise.all(
      Array.from({ length: 4 }, () => assess.handler(answers, context("ladder-a", "1"))),
    );

    expect(decide).toHaveBeenCalledTimes(3);
    expect(results.filter((result) => result.structuredContent?.fallback === false)).toHaveLength(
      3,
    );
    expect(results.filter((result) => result.structuredContent?.fallback === true)).toHaveLength(1);
    const usage = await db
      .select()
      .from(apiUsage)
      .where(and(eq(apiUsage.userId, "ladder-a"), eq(apiUsage.api, "decisions_ladder")));
    expect(usage).toHaveLength(3);
    expect(usage.every((row) => row.inputTokens === 30)).toBe(true);
  });

  it("retains an ordinary failed-request reservation because upstream usage is uncertain", async () => {
    const failed = findTool(
      createLadderTools({
        decide: async () => {
          throw new Error("temporary outage");
        },
      }),
      "assess_ai_level",
    );
    const fallback = await failed.handler(answers, context("ladder-a", "1"));
    expect(fallback.structuredContent).toMatchObject({ fallback: true });
    expect(
      await db
        .select()
        .from(apiUsage)
        .where(and(eq(apiUsage.userId, "ladder-a"), eq(apiUsage.api, "decisions_ladder"))),
    ).toHaveLength(1);
  });
});
