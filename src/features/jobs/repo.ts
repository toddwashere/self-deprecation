import { and, count, eq, gte, inArray, max, notLike, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { fetchRuns, jobs } from "../../db/schema";
import { cleanDescription } from "../../sources/adapters/normalization";
import type { NormalizedJob } from "../../sources/types";

export async function startFetchRun(
  db: DB,
  source: string,
  kind: "jobs" | "news",
  now: number,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(fetchRuns).values({ id, source, kind, startedAt: now, status: "running" });
  return id;
}

export async function finishFetchRun(
  db: DB,
  id: string,
  result: { status: "ok" | "error"; itemsUpserted: number; error?: string },
  now: number,
): Promise<void> {
  await db
    .update(fetchRuns)
    .set({
      finishedAt: now,
      status: result.status,
      itemsUpserted: result.itemsUpserted,
      error: result.error?.slice(0, 500) ?? null,
    })
    .where(eq(fetchRuns.id, id));
}

// One D1 batch is one invocation query; each statement keeps its own parameter limit.
export const JOB_UPSERT_BATCH_SIZE = 100;

export async function upsertJobs(
  db: DB,
  items: NormalizedJob[],
  now: number,
  options: { signal?: AbortSignal } = {},
): Promise<number> {
  options.signal?.throwIfAborted();
  const unique = [
    ...new Map(items.map((item) => [`${item.source}:${item.sourceJobId}`, item])).values(),
  ];
  const statements = await Promise.all(
    unique.map(async (item) => {
      const values = {
        source: item.source,
        sourceJobId: item.sourceJobId,
        company: item.company,
        title: item.title,
        location: item.location ?? null,
        remote: item.remote ?? null,
        employmentType: item.employmentType,
        salaryMin: item.salaryMin ?? null,
        salaryMax: item.salaryMax ?? null,
        currency: item.currency ?? null,
        url: item.url,
        descriptionText: item.descriptionText ? cleanDescription(item.descriptionText) : null,
        tags: item.tags ?? [],
        postedAt: item.postedAt ?? null,
      };
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(values)),
      );
      const contentHash = Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const update = { ...values, fetchedAt: now, lastSeenAt: now, contentHash };
      return {
        statement: db
          .insert(jobs)
          .values({ id: `${item.source}:${item.sourceJobId}`, ...update })
          .onConflictDoUpdate({ target: [jobs.source, jobs.sourceJobId], set: update }),
      };
    }),
  );
  for (let offset = 0; offset < statements.length; offset += JOB_UPSERT_BATCH_SIZE) {
    options.signal?.throwIfAborted();
    const batch = statements
      .slice(offset, offset + JOB_UPSERT_BATCH_SIZE)
      .map((entry) => entry.statement);
    if (batch.length)
      await db.batch(batch as [(typeof batch)[number], ...(typeof batch)[number][]]);
  }
  options.signal?.throwIfAborted();
  return unique.length;
}

export async function hasRecentFetch(db: DB, source: string, since: number): Promise<boolean> {
  const row = await db
    .select({ id: fetchRuns.id })
    .from(fetchRuns)
    .where(
      and(
        eq(fetchRuns.source, source),
        eq(fetchRuns.status, "ok"),
        gte(fetchRuns.finishedAt, since),
      ),
    )
    .limit(1)
    .get();
  return Boolean(row);
}

export async function lastFetchTimes(db: DB, sources: string[]): Promise<Map<string, number>> {
  if (!sources.length) return new Map();
  const rows = await db
    .select({ source: fetchRuns.source, startedAt: max(fetchRuns.startedAt) })
    .from(fetchRuns)
    .where(inArray(fetchRuns.source, sources))
    .groupBy(fetchRuns.source);
  const times = new Map<string, number>();
  for (const row of rows) if (!times.has(row.source)) times.set(row.source, row.startedAt ?? 0);
  return times;
}

export async function getCatalogStats(db: DB) {
  const sources = await db
    .select({ source: jobs.source, count: count() })
    .from(jobs)
    .groupBy(jobs.source)
    .orderBy(jobs.source);
  return { total: sources.reduce((total, row) => total + row.count, 0), sources };
}

export async function hasLiveJobs(db: DB): Promise<boolean> {
  const row = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(notLike(jobs.tags, '%"snapshot"%'))
    .limit(1)
    .get();
  return Boolean(row);
}

// D1 executes this single conditional INSERT atomically across Worker isolates.
export async function claimFreshFetch(
  db: DB,
  source: string,
  now: number,
  freshForMs: number,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const result = await db.run(sql`
    INSERT INTO fetch_runs (id, source, kind, started_at, status)
    SELECT ${id}, ${source}, 'jobs', ${now}, 'running'
    WHERE NOT EXISTS (
      SELECT 1 FROM fetch_runs
      WHERE source = ${source} AND (
        (status = 'ok' AND finished_at >= ${now - freshForMs})
        OR (status = 'running' AND started_at >= ${now - 10_000})
      )
    )
  `);
  return result.meta.changes === 1 ? id : null;
}
