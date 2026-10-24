import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, expect, it } from "vitest";
import demo from "../../../seed/demo-todd.json";
import { createDb } from "../../db/client";
import { apiUsage, jobMatches, jobs, profiles, userState, users } from "../../db/schema";
import type { Env } from "../../env";
import type { DecisionRequest } from "../../lib/decisions";
import type { ToolContext } from "../../mcp/types";
import { jobsOutputSchema } from "../jobs/tools";
import { runJobSearch } from "./service";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
const now = Date.UTC(2026, 9, 24);
const ctx: ToolContext = {
  db,
  userId: "a",
  env: { ...bound, DECISIONS_ENABLED: "1", DECISIONS_DAILY_JOB_CAP: "300" },
  now: () => new Date(now),
  log: { info() {}, warn() {}, error() {} },
  identity: { userId: "a", name: "Test" },
};
beforeAll(async () => {
  await applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS);
});
beforeEach(async () => {
  await db.delete(apiUsage);
  await db.delete(jobMatches);
  await db.delete(userState);
  await db.delete(profiles);
  await db.delete(jobs);
  await db.delete(users);
  await db.insert(users).values(["a", "b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db
    .insert(profiles)
    .values({ userId: "a", ...demo.profile, criteriaVersion: 1, updatedAt: now });
  for (let i = 0; i < 25; i++)
    await db.insert(jobs).values({
      id: `job-${i}`,
      source: "seed",
      sourceJobId: `${i}`,
      company: "Example",
      title: "Senior Software Engineer",
      remote: true,
      location: "Remote US",
      employmentType: "full_time",
      salaryMin: 180000,
      salaryMax: 200000,
      currency: "USD",
      descriptionText: "TypeScript React Postgres",
      tags: ["typescript", "react", "postgres"],
      url: `https://example.com/jobs/${i}`,
      postedAt: now,
      fetchedAt: now,
      lastSeenAt: now,
    });
});
const decide = async (request: DecisionRequest) => ({
  answers: request.questions.map((q) =>
    q.type === "score"
      ? { type: "score" as const, name: q.name, score: 3, confidence: 0.8, probabilities: [] }
      : { type: "predicate" as const, name: q.name, probability: 0.9 },
  ),
  usage: { input_tokens: 100 },
});

it("scores a bounded batch, resumes the remainder, and reuses current-version scores", async () => {
  const first = await runJobSearch(ctx, { query: "TypeScript", remoteOnly: true }, { decide });
  expect(first?.progress).toEqual({ stage: "scoring", done: 20, total: 25 });
  expect(first?.jobs.filter((j) => j.fitScore === 75)).toHaveLength(20);
  expect(
    (await db.select().from(userState).where(eq(userState.userId, "a")).get())?.value,
  ).toMatchObject({
    filters: { query: "TypeScript", remoteOnly: true },
  });
  const second = await runJobSearch(ctx, { query: "TypeScript", remoteOnly: true }, { decide });
  expect(second?.progress).toEqual({ stage: "done", done: 25, total: 25 });
  expect(second?.jobs.every((j) => j.scoreSource === "decisions")).toBe(true);
  const cached = await runJobSearch(
    ctx,
    {},
    {
      decide: async () => {
        throw new Error("must use cache");
      },
    },
  );
  expect(cached?.jobs.every((j) => j.scoreSource === "decisions")).toBe(true);
  expect(await db.select().from(apiUsage)).toHaveLength(2);
  expect(jobsOutputSchema.safeParse(cached).success).toBe(true);
});

it("shows fallback after an outage and invalidates scores when criteria change", async () => {
  const first = await runJobSearch(ctx, {}, { decide });
  expect(first?.fallback).toBe(false);
  await db.update(profiles).set({ criteriaVersion: 2, skills: ["python"] });
  const fallback = await runJobSearch(
    ctx,
    {},
    {
      decide: async () => {
        throw new Error("outage");
      },
    },
  );
  expect(fallback?.criteriaVersion).toBe(2);
  expect(fallback?.fallback).toBe(true);
  expect(
    fallback?.jobs.filter((j) => j.fitScore !== null).every((j) => j.scoreSource === "heuristic"),
  ).toBe(true);
  expect(
    fallback?.jobs
      .filter((j) => j.fitScore === null)
      .every((j) => j.reasons.includes("typescript, postgres, react") === false),
  ).toBe(true);
});

it("returns NEEDS_CRITERIA behavior without another user's data", async () => {
  await runJobSearch(ctx, {}, { decide });
  expect(await runJobSearch({ ...ctx, userId: "b" }, {}, { decide })).toBeUndefined();
});

it.each([
  { batchSize: "20", scored: 20 },
  { batchSize: "0", scored: 1 },
])(
  "falls back within the tool deadline with batch size $batchSize",
  async ({ batchSize, scored }) => {
    const started = performance.now();
    const result = await runJobSearch(
      { ...ctx, env: { ...ctx.env, DECISIONS_BATCH_SIZE: batchSize, DECISIONS_CONCURRENCY: "1" } },
      {},
      {
        decide: async (_request, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
          }),
      },
    );
    expect(performance.now() - started).toBeLessThan(8000);
    expect(result?.fallback).toBe(true);
    expect(result?.jobs.filter((job) => job.fitScore !== null)).toHaveLength(scored);
  },
  9000,
);

it("keeps saved matches discoverable beyond the unfiltered top sixty", async () => {
  for (let i = 25; i < 65; i++) {
    await db.insert(jobs).values({
      id: `job-${i}`,
      source: "seed",
      sourceJobId: `${i}`,
      company: "Example",
      title: "Senior Software Engineer",
      remote: true,
      location: "Remote US",
      employmentType: "full_time",
      tags: ["typescript"],
      url: `https://example.com/jobs/${i}`,
      postedAt: now,
      fetchedAt: now,
      lastSeenAt: now,
    });
  }
  await db.insert(jobMatches).values({
    id: "saved-low",
    userId: "a",
    jobId: "job-64",
    status: "saved",
    criteriaVersion: 1,
    updatedAt: now,
  });
  const result = await runJobSearch(ctx, { status: "saved" }, { decide });
  expect(result?.jobs.map((job) => job.id)).toEqual(["job-64"]);
});

it("normalizes a zero batch size to one scored candidate per invocation", async () => {
  const result = await runJobSearch(
    { ...ctx, env: { ...ctx.env, DECISIONS_BATCH_SIZE: "0", DECISIONS_CONCURRENCY: "1" } },
    {},
    { decide },
  );
  expect(result?.progress).toEqual({ stage: "scoring", done: 1, total: 25 });
  expect(result?.jobs.filter((job) => job.fitScore !== null)).toHaveLength(1);
});
