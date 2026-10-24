import { eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { fetchRuns, jobs } from "../../db/schema";
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
      error: result.error?.slice(0, 500),
    })
    .where(eq(fetchRuns.id, id));
}

export async function upsertJobs(db: DB, items: NormalizedJob[], now: number): Promise<number> {
  for (const item of items) {
    await db
      .insert(jobs)
      .values({
        id: `${item.source}:${item.sourceJobId}`,
        source: item.source,
        sourceJobId: item.sourceJobId,
        company: item.company,
        title: item.title,
        location: item.location,
        remote: item.remote,
        employmentType: item.employmentType,
        salaryMin: item.salaryMin,
        salaryMax: item.salaryMax,
        currency: item.currency,
        url: item.url,
        descriptionText: item.descriptionText,
        tags: item.tags ?? [],
        postedAt: item.postedAt,
        fetchedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [jobs.source, jobs.sourceJobId],
        set: {
          company: item.company,
          title: item.title,
          location: item.location,
          remote: item.remote,
          employmentType: item.employmentType,
          salaryMin: item.salaryMin,
          salaryMax: item.salaryMax,
          currency: item.currency,
          url: item.url,
          descriptionText: item.descriptionText,
          tags: item.tags ?? [],
          postedAt: item.postedAt,
          fetchedAt: now,
          lastSeenAt: now,
        },
      });
  }
  return items.length;
}
