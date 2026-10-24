import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { jobMatches, jobs, profiles, userState, users } from "../../db/schema";
import type { Env } from "../../env";
import { getJobMatch, getMatches, saveJobScores, setJobStatus, writeScoringProgress } from "./repo";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
beforeAll(async () => {
  await applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS);
});
beforeEach(async () => {
  await db.delete(jobMatches);
  await db.delete(userState);
  await db.delete(profiles);
  await db.delete(jobs);
  await db.delete(users);
  await db.insert(users).values(["a", "b"].map((id) => ({ id, createdAt: 1, updatedAt: 1 })));
  await db
    .insert(jobs)
    .values({
      id: "job",
      source: "seed",
      sourceJobId: "job",
      company: "Example",
      title: "Engineer",
      url: "https://example.com/job",
      fetchedAt: 1,
      lastSeenAt: 1,
    });
});

it("T1 keeps match scores, statuses and progress isolated per user", async () => {
  await saveJobScores(
    db,
    "a",
    1,
    [{ jobId: "job", score: 90, source: "decisions", reasons: ["typescript"], confidence: 0.9 }],
    2,
  );
  await setJobStatus(db, "a", "job", "saved", 1, 3);
  expect(await getMatches(db, "b")).toEqual([]);
  expect(await getJobMatch(db, "b", "job")).toBeUndefined();
  await setJobStatus(db, "b", "job", "dismissed", 1, 4);
  expect((await getJobMatch(db, "a", "job"))?.status).toBe("saved");
  expect((await getJobMatch(db, "a", "job"))?.fitScore).toBe(90);
  expect((await getJobMatch(db, "b", "job"))?.fitScore).toBeNull();
  await writeScoringProgress(db, "a", "jobs-v1", { stage: "scoring", done: 20, total: 60 }, 5);
  const rows = await db.select().from(userState);
  expect(rows).toMatchObject([
    {
      userId: "a",
      key: "task.jobs-v1",
      value: { status: "running", progress: { done: 20, total: 60 } },
    },
  ]);
});

it("preserves application status when rescoring and records the criteria version", async () => {
  await setJobStatus(db, "a", "job", "applied", 1, 2);
  await saveJobScores(
    db,
    "a",
    2,
    [{ jobId: "job", score: 75, source: "heuristic", reasons: ["Remote ✓"] }],
    3,
  );
  expect(await getJobMatch(db, "a", "job")).toMatchObject({
    status: "applied",
    fitScore: 75,
    criteriaVersion: 2,
    scoreSource: "heuristic",
    reasons: ["Remote ✓"],
    scoredAt: 3,
  });
});
