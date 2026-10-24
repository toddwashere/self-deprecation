import { and, desc, eq, or, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { fetchRuns, jobMatches, jobs, profiles } from "../../db/schema";

const SOURCES = ["hn_hiring", "hn_freelance"] as const;
const STATUSES = ["new", "saved", "applied", "interviewing", "offer", "rejected", "dismissed"];

export interface ContractFilters {
  query?: string;
  remoteOnly?: boolean;
  limit: number;
}

export async function getBridgeProfile(db: DB, userId: string) {
  const row = await db
    .select({ bridgeMode: profiles.bridgeMode, criteriaVersion: profiles.criteriaVersion })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();
  return row ?? { bridgeMode: false, criteriaVersion: 1 };
}

export async function setBridgeMode(db: DB, userId: string, enabled: boolean, now: number) {
  const current = await getBridgeProfile(db, userId);
  if (current.bridgeMode === enabled) return current;
  const criteriaVersion = current.criteriaVersion + 1;
  await db
    .insert(profiles)
    .values({ userId, bridgeMode: enabled, criteriaVersion, updatedAt: now })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { bridgeMode: enabled, criteriaVersion, updatedAt: now },
      setWhere: eq(profiles.userId, userId),
    });
  return { bridgeMode: enabled, criteriaVersion };
}

export async function listContractLeads(db: DB, userId: string, filters: ContractFilters) {
  const profile = await getBridgeProfile(db, userId);
  const query = filters.query?.trim().toLowerCase() ?? "";
  const rows = await db
    .select({ job: jobs, match: jobMatches })
    .from(jobs)
    .leftJoin(jobMatches, and(eq(jobMatches.jobId, jobs.id), eq(jobMatches.userId, userId)))
    .where(
      and(
        or(eq(jobs.employmentType, "contract"), eq(jobs.source, "hn_freelance")),
        filters.remoteOnly ? eq(jobs.remote, true) : undefined,
        query
          ? sql`instr(lower(coalesce(${jobs.company}, '') || ' ' || coalesce(${jobs.title}, '') || ' ' || coalesce(${jobs.location}, '') || ' ' || coalesce(${jobs.descriptionText}, '') || ' ' || coalesce(${jobs.tags}, '')), ${query}) > 0`
          : undefined,
      ),
    )
    .orderBy(desc(jobs.postedAt), desc(jobs.fetchedAt))
    .limit(200);
  const visible = rows
    .slice(0, filters.limit)
    .map(({ job, match }) => {
      const current = match?.criteriaVersion === profile.criteriaVersion;
      const status = STATUSES.includes(match?.status ?? "") ? match?.status : "new";
      return {
        id: job.id,
        source: job.source,
        company: job.company,
        title: job.title,
        location: job.location,
        remote: job.remote,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        url: job.url,
        descriptionText: job.descriptionText,
        tags: job.tags,
        postedAt: job.postedAt,
        fetchedAt: job.fetchedAt,
        fitScore: current ? (match?.fitScore ?? null) : null,
        scoreSource:
          current && (match?.scoreSource === "decisions" || match?.scoreSource === "heuristic")
            ? match.scoreSource
            : null,
        reasons: current && match?.fitScore !== null ? (match?.reasons ?? []) : ["Contract"],
        status: status ?? "new",
        scoredAt: current ? (match?.scoredAt ?? null) : null,
      };
    });
  const runs = await db
    .select()
    .from(fetchRuns)
    .where(or(eq(fetchRuns.source, SOURCES[0]), eq(fetchRuns.source, SOURCES[1])))
    .orderBy(desc(fetchRuns.startedAt));
  const latest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) if (!latest.has(run.source)) latest.set(run.source, run);
  const sources = SOURCES.map((source) => {
    const run = latest.get(source);
    return {
      source,
      status: run?.status ?? "never",
      lastSuccessAt:
        runs.find((candidate) => candidate.source === source && candidate.status === "ok")
          ?.finishedAt ?? null,
      lastFetchAt: run?.startedAt ?? 0,
    };
  });
  return { profile, jobs: visible, sources };
}
