import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import boards from "../../../seed/ats-boards.json";
import { createDb } from "../../db/client";
import { fetchRuns, jobs, profiles, users } from "../../db/schema";
import type { Env } from "../../env";
import { catalogTools, refreshOutputSchema } from "../../features/jobs/catalog-tools";
import { getCatalogStats, upsertJobs } from "../../features/jobs/repo";
import { fetchJobSources, refreshJobs, runRotatingJobBatch } from "../../features/jobs/service";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import type { NormalizedJob, SourceAdapter } from "../types";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
const now = 1_800_000_000_000;
const job: NormalizedJob = {
  source: "good",
  sourceJobId: "1",
  company: "Example",
  title: "Engineer",
  employmentType: "full_time",
  url: "https://example.com/jobs/1",
  salaryMin: 150000,
};
const good: SourceAdapter<NormalizedJob> = { id: "good", kind: "jobs", fetch: async () => [job] };
const bad: SourceAdapter<NormalizedJob> = {
  id: "bad",
  kind: "jobs",
  fetch: async () => {
    throw new Error("private-key person@example.com");
  },
};
function ctx(userId: string): ToolContext {
  return {
    userId,
    identity: { userId, name: userId },
    db,
    env: { ...testEnv, ADZUNA_APP_ID: "test-id", ADZUNA_APP_KEY: "test-key" },
    now: () => new Date(now),
    log: createLogger("test"),
  };
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(fetchRuns);
  await db.delete(jobs);
  await db.delete(profiles);
  await db.delete(users);
});
afterEach(() => vi.unstubAllGlobals());

describe("job catalog pipeline", () => {
  it("deduplicates a source batch, updates stable IDs, clears removed salary, and stores a content hash", async () => {
    expect(await upsertJobs(db, [job, { ...job, title: "Updated" }], now)).toBe(1);
    const first = await db.select().from(jobs).get();
    await upsertJobs(db, [{ ...job, title: "Updated again", salaryMin: undefined }], now + 1);
    const rows = await db.select().from(jobs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first?.id,
      title: "Updated again",
      salaryMin: null,
      lastSeenAt: now + 1,
    });
    expect(rows[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].contentHash).not.toBe(first?.contentHash);
    expect(await getCatalogStats(db)).toEqual({
      total: 1,
      sources: [{ source: "good", count: 1 }],
    });
  });

  it("records a failed source and upserts the next source without leaking error content", async () => {
    const result = await fetchJobSources(db, testEnv, [bad, good], {
      now: () => now,
      budgetMs: 1000,
    });
    expect(result.itemsUpserted).toBe(1);
    expect(await db.select().from(jobs)).toHaveLength(1);
    const runs = await db.select().from(fetchRuns);
    expect(runs.map((run) => run.status).sort()).toEqual(["error", "ok"]);
    expect(runs.find((run) => run.status === "error")?.error).not.toMatch(/private-key|@/);
  });

  it("bounds interactive work to three sources and returns a timeout instead of waiting forever", async () => {
    const never: SourceAdapter<NormalizedJob> = {
      id: "never",
      kind: "jobs",
      fetch: () => new Promise(() => {}),
    };
    const fourth = { ...good, id: "fourth", fetch: vi.fn(good.fetch) };
    const result = await fetchJobSources(db, testEnv, [good, bad, never, fourth], {
      now: () => now,
      budgetMs: 20,
      maxSources: 3,
    });
    expect(result.progress).toEqual({ stage: "done", done: 3, total: 3 });
    expect(result.sources.find((source) => source.source === "never")).toMatchObject({
      status: "error",
      reason: "TIMEOUT",
    });
    expect(fourth.fetch).not.toHaveBeenCalled();
  });

  it("uses only the caller's criteria and reuses Adzuna results for the same query/location for six hours", async () => {
    await db.insert(users).values([
      { id: "a", createdAt: now, updatedAt: now },
      { id: "b", createdAt: now, updatedAt: now },
    ]);
    await db.insert(profiles).values({
      userId: "a",
      targetTitles: ["Staff Engineer"],
      locations: ["Salt Lake City, Utah"],
      updatedAt: now,
    });
    const requests: URL[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      requests.push(url);
      return new Response(
        JSON.stringify(
          url.hostname === "api.adzuna.com"
            ? { results: [] }
            : url.hostname === "api.lever.co"
              ? []
              : { jobs: [] },
        ),
      );
    });
    const tool = catalogTools.find((item) => item.name === "refresh_jobs");
    expect(tool).toBeDefined();
    if (!tool) throw new Error("refresh_jobs is missing");
    const forged = await tool.handler({ userId: "a" }, ctx("b"));
    expect(forged).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "NEEDS_CRITERIA" } },
    });
    expect(requests).toHaveLength(0);
    const result = await refreshJobs(ctx("a"));
    expect(refreshOutputSchema.safeParse(result).success).toBe(true);
    await refreshJobs(ctx("a"));
    const adzuna = requests.filter((url) => url.hostname === "api.adzuna.com");
    expect(adzuna).toHaveLength(1);
    expect(adzuna[0].searchParams.get("what")).toBe("Staff Engineer");
    expect(adzuna[0].searchParams.get("where")).toBe("Salt Lake City, Utah");
  });

  it("rotates at most ten eligible boards and omits oversized feeds from network requests", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      requests.push(url);
      return new Response(JSON.stringify(url.hostname === "api.lever.co" ? [] : { jobs: [] }));
    });
    const first = await runRotatingJobBatch(testEnv, {
      db,
      now: () => now,
      includePublicFeeds: false,
    });
    const firstUrls = requests.map(String);
    requests.length = 0;
    await runRotatingJobBatch(testEnv, { db, now: () => now + 1, includePublicFeeds: false });
    expect(first.progress.total).toBeLessThanOrEqual(10);
    expect(requests.length).toBeLessThanOrEqual(10);
    expect(requests.map(String)).not.toEqual(firstUrls);
    expect([...firstUrls, ...requests.map(String)].join(" ")).not.toMatch(
      /anthropic|job-board\/openai/,
    );
    expect(first.skipped.some((item) => item.reason === "RESPONSE_TOO_LARGE")).toBe(true);
  });
});

it("loads a dated snapshot when every source fails and the catalog is empty", async () => {
  await db.insert(users).values({ id: "fallback", createdAt: now, updatedAt: now });
  await db
    .insert(profiles)
    .values({ userId: "fallback", targetTitles: ["Engineer"], updatedAt: now });
  vi.stubGlobal("fetch", async () => {
    throw new Error("offline");
  });
  const result = await refreshJobs(ctx("fallback"));
  expect(result.fallback).toBe(true);
  expect(result.snapshotCapturedAt).toBeGreaterThan(0);
  expect((await refreshJobs(ctx("fallback"))).fallback).toBe(true);
  const stored = await db.select().from(jobs);
  expect(stored.length).toBeGreaterThanOrEqual(60);
  expect(stored.every((job) => job.tags.includes("snapshot") && job.fetchedAt < now)).toBe(true);
});

it("throttles Remotive and Remote OK to six hours even across cron invocations", async () => {
  await db.insert(fetchRuns).values(
    ["remotive", "remoteok"].map((source) => ({
      id: source,
      source,
      kind: "jobs",
      startedAt: now,
      finishedAt: now,
      status: "ok",
    })),
  );
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => {
    requests.push(url);
    return new Response(JSON.stringify(url.hostname === "api.lever.co" ? [] : { jobs: [] }));
  });
  const result = await runRotatingJobBatch(testEnv, { db, now: () => now + 1000 });
  expect(requests.some((url) => /remotive|remoteok/.test(url.hostname))).toBe(false);
  expect(result.skipped).toEqual(
    expect.arrayContaining([
      { source: "remotive", reason: "FRESH" },
      { source: "remoteok", reason: "FRESH" },
    ]),
  );
});

it("replaces snapshot content in place when the corresponding live job returns", async () => {
  const { seedJobsAdapter } = await import("./seed");
  const [snapshot] = await seedJobsAdapter.fetch(testEnv, { limit: 1 });
  await upsertJobs(db, [snapshot], now - 1);
  const original = (await import("../../../seed/jobs-snapshot.json")).default.find(
    (item) => "source" in item,
  ) as unknown as NormalizedJob;
  await upsertJobs(db, [{ ...original, title: "Fresh live title" }], now);
  const rows = await db.select().from(jobs);
  expect(rows).toHaveLength(1);
  expect(rows[0].title).toBe("Fresh live title");
  expect(rows[0].tags).not.toContain("snapshot");
});

it("shares one Adzuna request when two users refresh the same query/location concurrently", async () => {
  await db
    .insert(users)
    .values(["room-a", "room-b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db.insert(profiles).values(
    ["room-a", "room-b"].map((userId) => ({
      userId,
      targetTitles: ["Engineer"],
      locations: ["Utah"],
      updatedAt: now,
    })),
  );
  let adzunaRequests = 0;
  vi.stubGlobal("fetch", async (url: URL) => {
    if (url.hostname === "api.adzuna.com") {
      adzunaRequests++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ results: [] }));
    }
    return new Response(JSON.stringify(url.hostname === "api.lever.co" ? [] : { jobs: [] }));
  });
  await Promise.all([refreshJobs(ctx("room-a")), refreshJobs(ctx("room-b"))]);
  expect(adzunaRequests).toBe(1);
});

it("keeps a full rotating batch within fifty D1 calls using committed board maxima and records failures", async () => {
  let calls = 0;
  const counted = new Proxy(testEnv.DB, {
    get(target, property) {
      if (property === "batch")
        return (...args: Parameters<D1Database["batch"]>) => {
          calls++;
          return target.batch(...args);
        };
      if (property === "prepare") return (sql: string) => statement(target.prepare(sql));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  function statement(prepared: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(prepared, {
      get(target, property) {
        if (property === "bind") return (...values: unknown[]) => statement(target.bind(...values));
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if (["run", "all", "raw", "first"].includes(String(property))) calls++;
          return value.apply(target, args);
        };
      },
    });
  }
  let failed = false;
  vi.stubGlobal("fetch", async (url: URL) => {
    const board = boards.find((board) => url.pathname.includes(board.token));
    if (!board) throw new Error("Unexpected source");
    if (failed && board.source === "lever") return new Response("", { status: 503 });
    const rows = Array.from({ length: Math.min(board.jobCount, 100) }, (_, index) => ({
      id: String(index + 1),
      title: "Engineer",
      text: "Engineer",
      absolute_url: `https://example.com/${index}`,
      hostedUrl: `https://example.com/${index}`,
      jobUrl: `https://example.com/${index}`,
    }));
    return new Response(JSON.stringify(board.source === "lever" ? rows : { jobs: rows }));
  });
  await runRotatingJobBatch(testEnv, { db: createDb(counted), now: () => now });
  expect(calls).toBeLessThanOrEqual(50);
  expect(calls).toBe(33);
  await db.delete(fetchRuns);
  failed = true;
  calls = 0;
  const result = await runRotatingJobBatch(testEnv, { db: createDb(counted), now: () => now });
  expect(calls).toBeLessThanOrEqual(50);
  expect(calls).toBe(32);
  expect(result.sources).toHaveLength(10);
  const runs = await db.select().from(fetchRuns);
  expect(runs).toHaveLength(10);
  expect(runs.filter((run) => run.status === "error")).toHaveLength(1);
});

it("returns partial progress when D1 persistence stalls and starts no later write batches", async () => {
  const { refreshJobsWithinBudget } = await import("../../features/jobs/service");
  await db.insert(users).values({ id: "deadline", createdAt: now, updatedAt: now });
  await db
    .insert(profiles)
    .values({ userId: "deadline", targetTitles: ["Engineer"], updatedAt: now });
  let batches = 0;
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const persistenceStarted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const slowD1 = new Proxy(testEnv.DB, {
    get(target, property) {
      if (property === "batch")
        return (...args: Parameters<D1Database["batch"]>) => {
          batches++;
          if (batches !== 1) return target.batch(...args);
          entered();
          return new Promise((resolve, reject) => {
            release = () => {
              target.batch(...args).then(resolve, reject);
            };
          });
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  vi.stubGlobal("fetch", async (url: URL) => {
    const rows = [
      {
        id: "1",
        title: "Engineer",
        text: "Engineer",
        absolute_url: job.url,
        hostedUrl: job.url,
        jobUrl: job.url,
      },
    ];
    return new Response(JSON.stringify(url.hostname === "api.lever.co" ? rows : { jobs: rows }));
  });
  const pending = refreshJobsWithinBudget(
    { ...ctx("deadline"), db: createDb(slowD1) },
    { timeoutMs: 100 },
  );
  await persistenceStarted;
  const result = await Promise.race([
    pending,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 300)),
  ]);
  try {
    expect(result).toMatchObject({ partial: true, progress: { stage: "fetching" } });
    expect(refreshOutputSchema.safeParse(result).success).toBe(true);
  } finally {
    release();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  expect(batches).toBe(1);
});

it("does not claim Adzuna work when hashing resumes after the refresh deadline", async () => {
  const { refreshJobsWithinBudget } = await import("../../features/jobs/service");
  await db.insert(users).values({ id: "hash-deadline", createdAt: now, updatedAt: now });
  await db.insert(profiles).values({
    userId: "hash-deadline",
    targetTitles: ["Engineer"],
    locations: ["Utah"],
    updatedAt: now,
  });
  const originalCrypto = globalThis.crypto;
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const hashingStarted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const subtle = new Proxy(originalCrypto.subtle, {
    get(target, property) {
      if (property === "digest")
        return (...args: Parameters<SubtleCrypto["digest"]>) => {
          entered();
          return new Promise<ArrayBuffer>((resolve, reject) => {
            release = () => {
              target.digest(...args).then(resolve, reject);
            };
          });
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  vi.stubGlobal(
    "crypto",
    new Proxy(originalCrypto, {
      get(target, property) {
        if (property === "subtle") return subtle;
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  const request = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", request);
  const pending = refreshJobsWithinBudget(ctx("hash-deadline"), { timeoutMs: 100 });
  await hashingStarted;
  const result = await pending;
  expect(result.partial).toBe(true);
  release();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(await db.select().from(fetchRuns)).toEqual([]);
  expect(request).not.toHaveBeenCalled();
});
