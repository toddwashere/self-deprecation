import boards from "../../../seed/ats-boards.json";
import { createDb, type DB } from "../../db/client";
import type { Env } from "../../env";
import type { ToolContext } from "../../mcp/types";
import { createAdzunaAdapter } from "../../sources/adapters/adzuna";
import { createAshbyAdapter } from "../../sources/adapters/ashby";
import { createGreenhouseAdapter } from "../../sources/adapters/greenhouse";
import { createLeverAdapter } from "../../sources/adapters/lever";
import { remoteOkAdapter } from "../../sources/adapters/remoteok";
import { remotiveAdapter } from "../../sources/adapters/remotive";
import { SNAPSHOT_CAPTURED_AT, seedJobsAdapter } from "../../sources/adapters/seed";
import type { NormalizedJob, SourceAdapter } from "../../sources/types";
import { getCriteria } from "../criteria/repo";
import {
  claimFreshFetch,
  finishFetchRun,
  getCatalogStats,
  hasLiveJobs,
  hasRecentFetch,
  lastFetchTimes,
  startFetchRun,
  upsertJobs,
} from "./repo";

export interface SourceOutcome {
  source: string;
  status: "ok" | "error" | "cached";
  itemsUpserted: number;
  reason?: string;
}
export interface CatalogRefresh {
  tab: "jobs";
  itemsUpserted: number;
  sources: SourceOutcome[];
  progress: { stage: "fetching" | "done"; done: number; total: number };
  partial?: boolean;
  fallback: boolean;
  snapshotCapturedAt?: number;
  skipped: { source: string; reason: string }[];
}

export class MissingCriteriaError extends Error {}

function safeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "TIMEOUT" || /timeout|aborted/i.test(message)) return "TIMEOUT";
  if (/size limit/i.test(message)) return "RESPONSE_TOO_LARGE";
  const status = /Source request failed \((\d{3})\)/.exec(message);
  if (status) return `HTTP_${status[1]}`;
  if (/Invalid .* response/.test(message)) return "INVALID_RESPONSE";
  return "SOURCE_UNAVAILABLE";
}

async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TIMEOUT")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchJobSources(
  db: DB,
  env: Env,
  adapters: readonly SourceAdapter<NormalizedJob>[],
  options: {
    now?: () => number;
    budgetMs?: number;
    maxSources?: number;
    limit?: number;
    runIds?: ReadonlyMap<string, string>;
    signal?: AbortSignal;
    onProgress?: (result: CatalogRefresh) => void;
  } = {},
): Promise<CatalogRefresh> {
  const now = options.now ?? Date.now;
  const chosen = adapters.slice(0, Math.min(options.maxSources ?? 3, 10));
  const sources: SourceOutcome[] = [];
  const report = (): CatalogRefresh => ({
    tab: "jobs",
    itemsUpserted: sources.reduce((sum, source) => sum + source.itemsUpserted, 0),
    sources: [...sources],
    progress: {
      stage: sources.length === chosen.length ? "done" : "fetching",
      done: sources.length,
      total: chosen.length,
    },
    fallback: false,
    skipped: [],
    ...(options.signal?.aborted ? { partial: true } : {}),
  });
  options.onProgress?.(report());
  const fetched = await Promise.all(
    chosen.map(async (adapter) => {
      options.signal?.throwIfAborted();
      const id =
        options.runIds?.get(adapter.id) ?? (await startFetchRun(db, adapter.id, "jobs", now()));
      try {
        options.signal?.throwIfAborted();
        const items = await bounded(
          adapter.fetch(env, { limit: options.limit ?? 100 }),
          Math.max(1, Math.min(options.budgetMs ?? 4_800, 5_000)),
        );
        return { adapter, id, items };
      } catch (error) {
        return { adapter, id, error: safeFailure(error) };
      }
    }),
  );
  for (const result of fetched) {
    if (options.signal?.aborted) break;
    try {
      if (result.error) throw new Error(result.error);
      const count = await upsertJobs(db, result.items ?? [], now(), { signal: options.signal });
      options.signal?.throwIfAborted();
      await finishFetchRun(db, result.id, { status: "ok", itemsUpserted: count }, now());
      sources.push({ source: result.adapter.id, status: "ok", itemsUpserted: count });
    } catch (error) {
      if (options.signal?.aborted) break;
      const reason = result.error ?? safeFailure(error);
      await finishFetchRun(
        db,
        result.id,
        { status: "error", itemsUpserted: 0, error: reason },
        now(),
      );
      sources.push({ source: result.adapter.id, status: "error", itemsUpserted: 0, reason });
    }
    options.onProgress?.(report());
  }
  return report();
}

function boardAdapter(
  board: (typeof boards)[number],
  timeoutMs = 4_500,
): SourceAdapter<NormalizedJob> {
  const options = {
    id: `${board.source}_${board.token}`,
    boardToken: board.token,
    company: board.company,
    timeoutMs,
  };
  if (board.source === "greenhouse") return createGreenhouseAdapter(options);
  if (board.source === "lever") return createLeverAdapter(options);
  return createAshbyAdapter(options);
}

async function queryKey(query: string, location: string): Promise<string> {
  const normalized = JSON.stringify(
    [query, location].map((value) => value.trim().toLowerCase().replace(/\s+/g, " ")),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return `adzuna_${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function refreshJobs(
  ctx: ToolContext,
  options: { signal?: AbortSignal; onProgress?: (result: CatalogRefresh) => void } = {},
): Promise<CatalogRefresh> {
  options.signal?.throwIfAborted();
  const criteria = await getCriteria(ctx.db, ctx.userId);
  options.signal?.throwIfAborted();
  if (!criteria.targetTitles.length) throw new MissingCriteriaError("Set up job criteria first");
  const now = ctx.now().getTime();
  const fastBoards = boards.filter((board) =>
    ["lucidsoftware", "wealthfront"].includes(board.token),
  );
  const adapters = fastBoards.map((board) => boardAdapter(board, 2_500));
  const cached: SourceOutcome[] = [];
  const runIds = new Map<string, string>();
  const skipped: CatalogRefresh["skipped"] = [];
  if (criteria.locations.length && ctx.env.ADZUNA_APP_ID && ctx.env.ADZUNA_APP_KEY) {
    const query = criteria.targetTitles[0];
    const location = criteria.locations[0];
    const key = await queryKey(query, location);
    const claimed = await claimFreshFetch(ctx.db, key, now, 6 * 60 * 60 * 1_000);
    if (!claimed) {
      const fresh = await hasRecentFetch(ctx.db, key, now - 6 * 60 * 60 * 1_000);
      cached.push({
        source: "adzuna",
        status: "cached",
        itemsUpserted: 0,
        ...(fresh ? {} : { reason: "FETCH_IN_PROGRESS" }),
      });
    } else {
      runIds.set(key, claimed);
      adapters.push({ ...createAdzunaAdapter({ query, location, timeoutMs: 2_500 }), id: key });
    }
  } else {
    skipped.push({
      source: "adzuna",
      reason: criteria.locations.length ? "NOT_CONFIGURED" : "NO_LOCATION",
    });
    const backup = boards.find((board) => board.token === "linear");
    if (backup) adapters.push(boardAdapter(backup, 2_500));
  }
  options.signal?.throwIfAborted();
  const result = await fetchJobSources(ctx.db, ctx.env, adapters, {
    now: () => now,
    maxSources: 3,
    budgetMs: 2_800,
    signal: options.signal,
    onProgress: options.onProgress,
    runIds,
  });
  options.signal?.throwIfAborted();
  result.sources.push(...cached);
  result.skipped = skipped;
  if ((await getCatalogStats(ctx.db)).total === 0) {
    const seeded = await fetchJobSources(ctx.db, ctx.env, [seedJobsAdapter], {
      now: () => SNAPSHOT_CAPTURED_AT,
      limit: 100,
      signal: options.signal,
      onProgress: options.onProgress,
    });
    result.itemsUpserted += seeded.itemsUpserted;
    result.sources.push(...seeded.sources);
    result.fallback = seeded.itemsUpserted > 0;
    result.snapshotCapturedAt = SNAPSHOT_CAPTURED_AT;
  }
  if (!(await hasLiveJobs(ctx.db)) && (await getCatalogStats(ctx.db)).total > 0) {
    result.fallback = true;
    result.snapshotCapturedAt = SNAPSHOT_CAPTURED_AT;
  }
  result.progress = { stage: "done", done: result.sources.length, total: result.sources.length };
  return result;
}

export async function runRotatingJobBatch(
  env: Env,
  options: { db?: DB; now?: () => number; includePublicFeeds?: boolean } = {},
): Promise<CatalogRefresh> {
  const db = options.db ?? createDb(env.DB);
  const now = options.now ?? Date.now;
  const eligible = boards.filter((board) => board.responseBytes <= 2_000_000);
  // Interleave ATS families so the first batch has coverage from all three.
  const ordered = ["greenhouse", "lever", "ashby"].map((source) =>
    eligible.filter((board) => board.source === source),
  );
  const interleaved: typeof eligible = [];
  for (let index = 0; index < eligible.length; index++)
    for (const family of ordered) if (family[index]) interleaved.push(family[index]);
  const adapters = interleaved.map((board) => boardAdapter(board));
  const freshFeeds: CatalogRefresh["skipped"] = [];
  if (options.includePublicFeeds !== false) {
    for (const adapter of [remotiveAdapter, remoteOkAdapter]) {
      if (await hasRecentFetch(db, adapter.id, now() - 6 * 60 * 60 * 1_000))
        freshFeeds.push({ source: adapter.id, reason: "FRESH" });
      else adapters.push(adapter);
    }
  }
  const times = await lastFetchTimes(
    db,
    adapters.map((adapter) => adapter.id),
  );
  adapters.sort((a, b) => (times.get(a.id) ?? 0) - (times.get(b.id) ?? 0));
  const result = await fetchJobSources(db, env, adapters, { now, maxSources: 10, limit: 100 });
  result.skipped = [
    ...boards
      .filter((board) => board.responseBytes > 2_000_000)
      .map((board) => ({ source: `${board.source}_${board.token}`, reason: "RESPONSE_TOO_LARGE" })),
    ...freshFeeds,
  ];
  return result;
}

export const REFRESH_DEADLINE_MS = 6_000;

export async function refreshJobsWithinBudget(
  ctx: ToolContext,
  options: { timeoutMs?: number } = {},
): Promise<CatalogRefresh> {
  const controller = new AbortController();
  let latest: CatalogRefresh = {
    tab: "jobs",
    itemsUpserted: 0,
    sources: [],
    progress: { stage: "fetching", done: 0, total: 3 },
    fallback: false,
    skipped: [],
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      refreshJobs(ctx, {
        signal: controller.signal,
        onProgress: (result) => {
          latest = result;
        },
      }),
      new Promise<CatalogRefresh>((resolve) => {
        timer = setTimeout(
          () => {
            controller.abort();
            resolve({
              ...latest,
              partial: true,
              progress: { ...latest.progress, stage: "fetching" },
              skipped: [...latest.skipped, { source: "refresh", reason: "TIME_BUDGET" }],
            });
          },
          Math.max(1, Math.min(options.timeoutMs ?? REFRESH_DEADLINE_MS, REFRESH_DEADLINE_MS)),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
