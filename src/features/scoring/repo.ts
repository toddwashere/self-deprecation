import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { apiUsage, fetchRuns, jobMatches, jobs, profiles, userState } from "../../db/schema";

export async function getDecisionUnitsSince(
  db: DB,
  userId: string,
  since: number,
): Promise<number> {
  const row = await db
    .select({ units: sql<number>`coalesce(sum(${apiUsage.units}), 0)` })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.userId, userId),
        eq(apiUsage.api, "decisions"),
        gte(apiUsage.createdAt, since),
      ),
    )
    .get();
  return Number(row?.units ?? 0);
}

export async function recordDecisionUsage(
  db: DB,
  userId: string,
  units: number,
  inputTokens: number,
  createdAt: number,
): Promise<void> {
  await db.insert(apiUsage).values({
    id: crypto.randomUUID(),
    userId,
    api: "decisions",
    units,
    inputTokens,
    createdAt,
  });
}

export async function getMatches(db: DB, userId: string) {
  return db.select().from(jobMatches).where(eq(jobMatches.userId, userId));
}

export async function getJobMatch(db: DB, userId: string, jobId: string) {
  return db
    .select()
    .from(jobMatches)
    .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId)))
    .get();
}

export async function saveJobScores(
  db: DB,
  userId: string,
  criteriaVersion: number,
  scores: Array<import("../../lib/decisions").FitResult & { reasons: string[] }>,
  now: number,
): Promise<void> {
  for (const score of scores) {
    const values = {
      fitScore: score.score,
      scoreSource: score.source,
      reasons: score.reasons,
      criteriaVersion,
      scoreDetail: {
        seniorityP: score.seniorityP,
        stackP: score.stackP,
        confidence: score.confidence,
      },
      scoredAt: now,
      updatedAt: now,
    };
    await db
      .insert(jobMatches)
      .values({ id: crypto.randomUUID(), userId, jobId: score.jobId, ...values })
      .onConflictDoUpdate({
        target: [jobMatches.userId, jobMatches.jobId],
        set: values,
        setWhere: eq(jobMatches.userId, userId),
      });
  }
}

export async function setJobStatus(
  db: DB,
  userId: string,
  jobId: string,
  status: string,
  criteriaVersion: number,
  now: number,
): Promise<void> {
  await db
    .insert(jobMatches)
    .values({ id: crypto.randomUUID(), userId, jobId, status, criteriaVersion, updatedAt: now })
    .onConflictDoUpdate({
      target: [jobMatches.userId, jobMatches.jobId],
      set: { status, updatedAt: now },
      setWhere: eq(jobMatches.userId, userId),
    });
}

export async function writeScoringProgress(
  db: DB,
  userId: string,
  taskId: string,
  progress: { stage: string; done: number; total: number },
  now: number,
): Promise<void> {
  const key = `task.${taskId}`;
  const value = { taskId, status: progress.done >= progress.total ? "done" : "running", progress };
  await db
    .insert(userState)
    .values({ userId, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [userState.userId, userState.key],
      set: { value, updatedAt: now },
      setWhere: eq(userState.userId, userId),
    });
}

// Narrow catalog adapter: global reads never include another user's match data.
export async function getCatalogJobs(db: DB) {
  return db.select().from(jobs).orderBy(desc(jobs.fetchedAt)).limit(2000);
}

export async function getCatalogJob(db: DB, jobId: string) {
  return db.select().from(jobs).where(eq(jobs.id, jobId)).get();
}

export async function getScoringProfile(db: DB, userId: string) {
  return db.select().from(profiles).where(eq(profiles.userId, userId)).get();
}

export async function getSourceHealth(db: DB) {
  const runs = await db
    .select()
    .from(fetchRuns)
    .where(eq(fetchRuns.kind, "jobs"))
    .orderBy(desc(fetchRuns.startedAt))
    .limit(200);
  const sources = new Map<
    string,
    { source: string; status: string; lastSuccessAt: number | null; lastFetchAt: number }
  >();
  for (const run of runs) {
    const source = sources.get(run.source) ?? {
      source: run.source,
      status: run.status,
      lastSuccessAt: null,
      lastFetchAt: run.startedAt,
    };
    if (source.lastSuccessAt === null && (run.status === "ok" || run.status === "partial"))
      source.lastSuccessAt = run.finishedAt ?? run.startedAt;
    sources.set(run.source, source);
  }
  return [...sources.values()];
}
