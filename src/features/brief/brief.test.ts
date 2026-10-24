import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { createDb } from "../../db/client";
import {
  contacts,
  jobMatches,
  jobs,
  newsItems,
  profiles,
  savedEvents,
  userState,
  users,
} from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { briefFeature } from "./index";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
const now = Date.UTC(2026, 9, 24, 12);
const seen = now - 60_000;
beforeAll(() => applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(users);
  await db.delete(jobs);
  await db.delete(newsItems);
  await db
    .insert(users)
    .values(["brief-a", "brief-b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db.insert(profiles).values({
    userId: "brief-a",
    skills: ["typescript"],
    criteriaVersion: 2,
    timezone: "America/Denver",
    updatedAt: now,
  });
});
function context(userId = "brief-a", database = db): ToolContext {
  return {
    userId,
    identity: { userId, name: "Test" },
    db: database,
    env: bound,
    now: () => new Date(now),
    log: createLogger("brief-test"),
  };
}
async function call(name: string, args: Record<string, unknown> = {}, ctx = context()) {
  const tool = briefFeature.tools.find((tool) => tool.name === name);
  expect(tool, `registered ${name}`).toBeDefined();
  if (!tool) throw new Error(`Missing ${name}`);
  const result = await tool.handler(args as never, ctx);
  if (!result.isError) expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
  return result;
}
async function seed() {
  await db.insert(jobs).values(
    [
      { id: "top", title: "Staff engineer", employmentType: "full_time" },
      { id: "contract", title: "Contract engineer", employmentType: "contract" },
      { id: "old", title: "Already seen", employmentType: "full_time" },
      { id: "stale", title: "Old criteria", employmentType: "full_time" },
      { id: "dismissed", title: "Dismissed", employmentType: "full_time" },
    ].map((job) => ({
      ...job,
      company: "Example",
      source: "seed",
      sourceJobId: job.id,
      url: `https://example.com/${job.id}`,
      fetchedAt: now,
      lastSeenAt: now,
    })),
  );
  await db.insert(jobMatches).values(
    [
      { jobId: "top", fitScore: 95, scoredAt: now, criteriaVersion: 2, status: "new" },
      { jobId: "contract", fitScore: 90, scoredAt: now, criteriaVersion: 2, status: "new" },
      { jobId: "old", fitScore: 99, scoredAt: seen, criteriaVersion: 2, status: "new" },
      { jobId: "stale", fitScore: 100, scoredAt: now, criteriaVersion: 1, status: "new" },
      { jobId: "dismissed", fitScore: 100, scoredAt: now, criteriaVersion: 2, status: "dismissed" },
    ].map((match) => ({ ...match, id: match.jobId, userId: "brief-a", updatedAt: now })),
  );
  await db.insert(savedEvents).values(
    [
      { id: "upcoming", startsAt: now + 60_000, status: "going" },
      { id: "past", startsAt: now - 1, status: "going" },
      { id: "skipped", startsAt: now + 1, status: "skipped" },
      { id: "later", startsAt: now + 31 * 86_400_000, status: "interested" },
    ].map((event) => ({
      ...event,
      userId: "brief-a",
      title: event.id,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })),
  );
  await db.insert(contacts).values(
    [
      { id: "due", followUpAt: now },
      { id: "future", followUpAt: now + 1 },
      { id: "no-date", followUpAt: null },
    ].map((contact) => ({
      ...contact,
      userId: "brief-a",
      name: contact.id,
      createdAt: now,
      updatedAt: now,
    })),
  );
  await db.insert(newsItems).values(
    Array.from({ length: 7 }, (_, i) => ({
      id: `news-${i}`,
      source: "seed",
      title: `News ${i}`,
      url: `https://example.com/news-${i}`,
      publishedAt: now - i,
      fetchedAt: now,
    })),
  );
}

it("T1 isolates personal sections and seen state while sharing public headlines", async () => {
  await seed();
  await db
    .insert(profiles)
    .values({ userId: "brief-b", skills: ["typescript"], criteriaVersion: 2, updatedAt: now });
  await call("mark_brief_seen", { asOf: seen });
  expect((await call("get_brief_data")).structuredContent).toMatchObject({
    lastSeenAt: seen,
    matches: [{ id: "top" }, { id: "contract" }],
    events: [{ id: "upcoming" }],
    followUps: [{ id: "due" }],
  });
  const other = await call("get_brief_data", {}, context("brief-b"));
  expect(other.structuredContent).toMatchObject({
    lastSeenAt: null,
    needsCriteria: false,
    matches: [],
    contractLeads: [],
    events: [],
    followUps: [],
    headlines: expect.any(Array),
  });
  expect((other.structuredContent?.headlines as unknown[] | undefined)?.length).toBe(5);
  await call("mark_brief_seen", { asOf: now }, context("brief-b"));
  expect((await call("get_brief_data")).structuredContent?.lastSeenAt).toBe(seen);
});

it("aggregates current new matches, contract leads, upcoming events, due contacts and five headlines deterministically", async () => {
  await seed();
  await call("mark_brief_seen", { asOf: seen });
  const result = (await call("get_brief_data")).structuredContent;
  expect(result).toMatchObject({
    tab: "today",
    asOf: now,
    timezone: "America/Denver",
    needsCriteria: false,
    matches: [
      { id: "top", fitScore: 95 },
      { id: "contract", fitScore: 90 },
    ],
    contractLeads: [{ id: "contract" }],
    events: [{ id: "upcoming" }],
    followUps: [{ id: "due" }],
    unavailable: [],
    progress: { stage: "done" },
  });
  expect((result?.headlines as { id: string }[] | undefined)?.map((item) => item.id)).toEqual([
    "news-0",
    "news-1",
    "news-2",
    "news-3",
    "news-4",
  ]);
});

it("advances only to the viewed snapshot, never backwards, and rejects future or impersonation input", async () => {
  await call("mark_brief_seen", { asOf: seen });
  await call("mark_brief_seen", { asOf: seen - 1 });
  expect((await call("get_brief_data")).structuredContent?.lastSeenAt).toBe(seen);
  for (const args of [{}, { asOf: -1 }, { asOf: now + 1 }, { asOf: now, userId: "brief-b" }]) {
    expect(await call("mark_brief_seen", args)).toMatchObject({
      isError: true,
      _meta: { "self-deprecation/error": { code: "INVALID_INPUT" } },
    });
  }
  expect(await call("get_brief_data", { userId: "brief-b" })).toMatchObject({ isError: true });
});

it("keeps ready personal sections when public news cannot be read and returns scoring progress", async () => {
  await seed();
  await db.insert(userState).values({
    userId: "brief-a",
    key: "task.jobs-v2",
    value: {
      taskId: "jobs-v2",
      status: "running",
      progress: { stage: "scoring", done: 2, total: 10 },
    },
    updatedAt: now,
  });
  const database = createDb({
    prepare(query: string) {
      if (query.includes('"news_items"')) throw new Error("unavailable");
      return bound.DB.prepare(query);
    },
  } as D1Database);
  expect(
    (await call("get_brief_data", {}, context("brief-a", database))).structuredContent,
  ).toMatchObject({
    matches: expect.arrayContaining([expect.objectContaining({ id: "top" })]),
    events: [{ id: "upcoming" }],
    headlines: [],
    unavailable: ["headlines"],
    progress: { stage: "awaiting_scoring", done: 2, total: 10, taskId: "jobs-v2" },
  });
});

it("reports unfinished Jobs batches as needing continuation instead of background scoring", async () => {
  await db.insert(userState).values({
    userId: "brief-a",
    key: "task.jobs-v2",
    value: {
      taskId: "jobs-v2",
      status: "running",
      progress: { stage: "scoring", done: 2, total: 10 },
    },
    updatedAt: now,
  });
  for (let read = 0; read < 2; read++) {
    expect((await call("get_brief_data")).structuredContent).toMatchObject({
      progress: { stage: "awaiting_scoring", done: 2, total: 10, taskId: "jobs-v2" },
    });
  }
});

it("preserves normalized scoring filters for resumption and never invents defaults for legacy tasks", async () => {
  const filters = {
    query: "Platform",
    status: "saved",
    employmentType: "contract",
    remoteOnly: true,
    hideUnlistedSalary: true,
    limit: 17,
  };
  await db.insert(userState).values({
    userId: "brief-a",
    key: "task.jobs-v2",
    value: {
      taskId: "jobs-v2",
      status: "running",
      progress: { stage: "scoring", done: 2, total: 10 },
      filters,
    },
    updatedAt: now,
  });
  expect((await call("get_brief_data")).structuredContent).toMatchObject({
    progress: {
      stage: "awaiting_scoring",
      resumeFilters: {
        query: "Platform",
        status: "saved",
        employmentType: "contract",
        remoteOnly: true,
        hideUnlistedSalary: true,
        limit: 17,
      },
    },
  });
  await db.delete(userState);
  await db.insert(userState).values({
    userId: "brief-a",
    key: "task.jobs-v2",
    value: {
      taskId: "jobs-v2",
      status: "running",
      progress: { stage: "scoring", done: 2, total: 10 },
    },
    updatedAt: now,
  });
  expect((await call("get_brief_data")).structuredContent).toMatchObject({
    progress: { stage: "awaiting_scoring", resumeFilters: null },
  });
});
