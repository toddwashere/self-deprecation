import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dispatchCron } from "../../cron/dispatcher";
import { createDb } from "../../db/client";
import { fetchRuns, newsItems } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { newsFeature } from "./index";
import { upsertNews } from "./repo";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
const now = Date.UTC(2026, 9, 24, 12);
const ctx = {
  db,
  env: testEnv,
  userId: "user-a",
  identity: { userId: "user-a", name: "Test" },
  log: createLogger("news-test"),
  now: () => new Date(now),
} satisfies ToolContext;
beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(newsItems);
  await db.delete(fetchRuns);
});
const item = {
  source: "openai_news",
  title: "New AI model",
  url: "https://openai.com/story",
  publishedAt: now - 3600000,
  tags: ["ai", "llm"],
};

describe("AI news catalog (T7)", () => {
  it("deduplicates canonical links across refreshes and bounds stored snippets", async () => {
    await upsertNews(
      db,
      [{ ...item, url: `${item.url}?utm_source=rss`, snippet: "<p>Hello</p>" }],
      now,
    );
    await upsertNews(db, [{ ...item, snippet: "x".repeat(700) }], now + 1);
    const rows = await db.select().from(newsItems);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ url: item.url, fetchedAt: now + 1 });
    expect(rows[0].snippet).toHaveLength(500);
  });
  it("records an unavailable source while a healthy source still persists news", async () => {
    const result = await dispatchCron(testEnv, "0 12 * * *", {
      now: () => now,
      adapters: [
        {
          id: "unavailable",
          kind: "news",
          fetch: async () => {
            throw new Error("timeout");
          },
        },
        { id: "openai_news", kind: "news", fetch: async () => [item] },
      ],
    });
    expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1, itemsUpserted: 1 });
    expect(await db.select().from(newsItems)).toHaveLength(1);
    expect((await db.select().from(fetchRuns)).map((row) => [row.source, row.status])).toEqual([
      ["unavailable", "error"],
      ["openai_news", "ok"],
    ]);
  });
});

describe("get_ai_news contract (T4)", () => {
  it("returns bounded topic-filtered dated news and validates its output contract", async () => {
    const tool = newsFeature.tools.find((tool) => tool.name === "get_ai_news");
    expect(tool).toBeDefined();
    if (!tool) return;
    await upsertNews(
      db,
      [
        item,
        { ...item, url: "https://openai.com/unknown", publishedAt: undefined },
        { ...item, url: "https://openai.com/old", publishedAt: now - 8 * 86400000 },
        { ...item, url: "https://openai.com/python", tags: ["python"] },
      ],
      now,
    );
    const result = await tool.handler(
      { since: now - 7 * 86400000, topics: ["LLM"], limit: 1 },
      ctx,
    );
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      tab: "news",
      stale: false,
      items: [{ url: item.url, ageHours: 1 }],
      progress: { stage: "done" },
    });
    expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
    const data = result.structuredContent as { items: unknown[] };
    expect(data.items).toHaveLength(1);
  });
  it("rejects invalid input and user impersonation and reports safe empty state", async () => {
    const tool = newsFeature.tools.find((tool) => tool.name === "get_ai_news");
    expect(tool).toBeDefined();
    if (!tool) return;
    for (const args of [
      { limit: 0 },
      { limit: 51 },
      { since: -1 },
      { topics: [""] },
      { userId: "user-b" },
    ]) {
      expect(await tool.handler(args, ctx)).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "INVALID_INPUT" } },
      });
    }
    const result = await tool.handler({}, ctx);
    expect(result.structuredContent).toMatchObject({ items: [], stale: true, updatedAt: null });
    expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(tool.status.invoking.length).toBeLessThanOrEqual(64);
    expect(tool.status.invoked.length).toBeLessThanOrEqual(64);
  });
  it("retains older catalog data and reports the latest source outage", async () => {
    const tool = newsFeature.tools.find((tool) => tool.name === "get_ai_news");
    expect(tool).toBeDefined();
    if (!tool) return;
    await upsertNews(db, [item], now - 2 * 86400000);
    await db.insert(fetchRuns).values([
      {
        id: "success",
        source: "openai_news",
        kind: "news",
        startedAt: now - 2 * 86400000,
        finishedAt: now - 2 * 86400000,
        status: "ok",
        itemsUpserted: 1,
      },
      {
        id: "outage",
        source: "openai_news",
        kind: "news",
        startedAt: now,
        finishedAt: now,
        status: "error",
        itemsUpserted: 0,
        error: "private detail must not be returned",
      },
    ]);
    const result = await tool.handler({}, ctx);
    expect(result.structuredContent).toMatchObject({
      stale: true,
      sources: expect.arrayContaining([
        {
          id: "openai_news",
          label: "OpenAI",
          status: "error",
          lastSuccessAt: now - 2 * 86400000,
          finishedAt: now,
        },
      ]),
    });
    expect(JSON.stringify(result)).not.toContain("private detail");
  });
});
