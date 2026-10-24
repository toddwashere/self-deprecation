import { type Decide, jobDigest, scoreFit } from "../../lib/decisions";
import type { ToolContext } from "../../mcp/types";
import type { JobCard, JobsOutput } from "../jobs/tools";
import { candidateJobs, jobReasons } from "./filters";
import {
  getCatalogJobs,
  getMatches,
  getScoringProfile,
  getSourceHealth,
  saveJobScores,
  writeScoringProgress,
} from "./repo";
import { normalizeSearchFilters, searchArgs } from "./search-state";
import type { CandidateJob, JobFilters, ScoringProfile } from "./types";

type Match = Awaited<ReturnType<typeof getMatches>>[number];

export function jobCard(job: CandidateJob, profile: ScoringProfile, match?: Match): JobCard {
  const current = match?.criteriaVersion === profile.criteriaVersion;
  const status = match?.status ?? "new";
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
    fitScore: current ? match.fitScore : null,
    scoreSource:
      current && (match.scoreSource === "decisions" || match.scoreSource === "heuristic")
        ? match.scoreSource
        : null,
    reasons: current && match.fitScore !== null ? match.reasons : jobReasons(profile, job),
    status: (["new", "saved", "applied", "interviewing", "offer", "rejected", "dismissed"].includes(
      status,
    )
      ? status
      : "new") as JobCard["status"],
    scoredAt: current ? match.scoredAt : null,
  };
}

export async function runJobSearch(
  ctx: ToolContext,
  filters: JobFilters = {},
  options: { decide?: Decide; limit?: number } = {},
): Promise<JobsOutput | undefined> {
  const profile = await getScoringProfile(ctx.db, ctx.userId);
  if (!profile || (!profile.targetTitles.length && !profile.skills.length)) return undefined;
  const normalizedFilters = normalizeSearchFilters({
    ...filters,
    limit: options.limit,
    hideUnlistedSalary: filters.hideUnlistedSalary ?? profile.extra?.hideUnlistedSalary === true,
  });
  const activeFilters = searchArgs(normalizedFilters);
  const [catalog, matches, sources] = await Promise.all([
    getCatalogJobs(ctx.db),
    getMatches(ctx.db, ctx.userId),
    getSourceHealth(ctx.db),
  ]);
  const byJob = new Map(matches.map((match) => [match.jobId, match]));
  const visible = catalog.filter((job) => {
    const status = byJob.get(job.id)?.status ?? "new";
    return activeFilters.status ? status === activeFilters.status : status !== "dismissed";
  });
  const selected = candidateJobs(profile, visible, ctx.now().getTime(), activeFilters);
  const pending = selected.filter((job) => {
    const match = byJob.get(job.id);
    return !match || match.criteriaVersion !== profile.criteriaVersion || match.fitScore === null;
  });
  const configuredBatchSize = Number.parseInt(ctx.env.DECISIONS_BATCH_SIZE ?? "", 10);
  const batchSize = Number.isFinite(configuredBatchSize)
    ? Math.min(20, Math.max(1, configuredBatchSize))
    : 20;
  const batch = pending.slice(0, batchSize);
  if (batch.length) {
    const profileText = JSON.stringify({
      targetTitles: profile.targetTitles,
      seniority: profile.seniority,
      skills: profile.skills,
      locations: profile.locations,
      remotePref: profile.remotePref,
      salaryMin: profile.salaryMin,
      avoid: profile.avoid,
      summary: profile.summary,
      resumeSummary: profile.resumeText?.slice(0, 2000),
    });
    const scores = await scoreFit(
      ctx.env,
      profileText,
      batch.map((job) => ({ jobId: job.id, jobText: jobDigest(job) })),
      { db: ctx.db, userId: ctx.userId, decide: options.decide, timeoutMs: 6000, now: ctx.now },
    );
    const evidence = new Map(batch.map((job) => [job.id, jobReasons(profile, job)]));
    await saveJobScores(
      ctx.db,
      ctx.userId,
      profile.criteriaVersion,
      scores.map((score) => ({ ...score, reasons: evidence.get(score.jobId) ?? [] })),
      ctx.now().getTime(),
    );
    for (const match of await getMatches(ctx.db, ctx.userId)) byJob.set(match.jobId, match);
  }
  const ranked = selected
    .map((job) => jobCard(job, profile, byJob.get(job.id)))
    .sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1) || a.id.localeCompare(b.id));
  const done = ranked.filter((job) => job.fitScore !== null).length;
  const progress: JobsOutput["progress"] = {
    stage: done === ranked.length ? "done" : "scoring",
    done,
    total: ranked.length,
  };
  const taskId = `jobs-v${profile.criteriaVersion}`;
  await writeScoringProgress(ctx.db, ctx.userId, taskId, progress, ctx.now().getTime());
  return {
    tab: "jobs",
    jobs: ranked.slice(0, normalizedFilters.limit),
    filters: normalizedFilters,
    criteriaVersion: profile.criteriaVersion,
    fallback: ranked.some((job) => job.scoreSource === "heuristic"),
    progress,
    taskId,
    sources,
  };
}
