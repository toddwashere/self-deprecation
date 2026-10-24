import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../db/client";
import { assertUserIsolation } from "../../db/isolation-test-helper";
import { savedEvents, users } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { eventsFeature } from "./index";
import { getEvent, listEvents, removeEvent, saveEvent, updateEvent } from "./repo";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
const now = 1_800_000_000_000;
beforeAll(() => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await db.delete(savedEvents);
  await db.delete(users);
  await db
    .insert(users)
    .values(["events-a", "events-b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
});
function context(userId: string): ToolContext {
  return {
    userId,
    identity: { userId, name: userId },
    db,
    env: testEnv,
    now: () => new Date(now),
    log: createLogger("test"),
  };
}
async function call(name: string, args: Record<string, unknown>, userId = "events-a") {
  const tool = eventsFeature.tools.find((tool) => tool.name === name);
  expect(tool, `registered tool ${name}`).toBeDefined();
  if (!tool) throw new Error(`Missing ${name}`);
  const result = await tool.handler(args as never, context(userId));
  if (!result.isError) expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
  return result;
}

describe("Events tools", () => {
  it("saves supplied facts with context ownership and lists upcoming/past/undated events", async () => {
    const saved = await call("save_event", {
      title: "AI Builders",
      city: "Salt Lake City",
      startsAt: now + 60_000,
      source: "chatgpt_search",
      userId: "events-b",
    });
    expect(saved.structuredContent).toMatchObject({
      tab: "events",
      event: {
        title: "AI Builders",
        city: "Salt Lake City",
        source: "chatgpt_search",
        status: "interested",
      },
    });
    await call("save_event", { title: "Past talk", startsAt: now - 60_000 });
    await call("save_event", { title: "Date to be confirmed" });
    for (const [period, title] of [
      ["upcoming", "AI Builders"],
      ["past", "Past talk"],
      ["undated", "Date to be confirmed"],
    ]) {
      const result = await call("list_events", { period });
      expect(result.structuredContent).toMatchObject({
        events: [expect.objectContaining({ title })],
        asOf: now,
      });
    }
    expect((await call("list_events", {}, "events-b")).structuredContent).toMatchObject({
      events: [],
    });
  });

  it("updates only the caller's event by ID and preserves omitted fields", async () => {
    const saved = await call("save_event", { title: "AI Builders", city: "Salt Lake City" });
    const id = (saved.structuredContent?.event as { id: string } | undefined)?.id;
    expect(await call("update_event", { eventId: id, status: "going" }, "events-b")).toMatchObject({
      isError: true,
      _meta: { "self-deprecation/error": { code: "NOT_FOUND" } },
    });
    expect(
      (await call("update_event", { eventId: id, status: "going" })).structuredContent,
    ).toMatchObject({ event: { title: "AI Builders", city: "Salt Lake City", status: "going" } });
    expect((await call("list_events", { status: "going" })).structuredContent).toMatchObject({
      events: [expect.objectContaining({ id })],
    });
  });

  it("rejects missing titles/URLs, invalid statuses, unsafe URLs, and reversed dates", async () => {
    for (const args of [
      {},
      { title: "Talk", status: "maybe" },
      { title: "Talk", url: "javascript:alert(1)" },
      { title: "Talk", startsAt: now, endsAt: now - 1 },
      { title: "x".repeat(301) },
    ]) {
      expect(await call("save_event", args)).toMatchObject({
        isError: true,
        _meta: { "self-deprecation/error": { code: "INVALID_INPUT" } },
      });
    }
    expect(await call("update_event", { eventId: "missing" })).toMatchObject({
      isError: true,
      _meta: { "self-deprecation/error": { code: "INVALID_INPUT" } },
    });
    expect(await call("list_events", { limit: 101 })).toMatchObject({
      isError: true,
      _meta: { "self-deprecation/error": { code: "INVALID_INPUT" } },
    });
  });
});

describe("Events isolation and metadata", () => {
  it("isolates repository reads, updates, and deletes by user and ID (T1)", async () => {
    await assertUserIsolation({
      userA: "events-a",
      userB: "events-b",
      createForA: async () => (await saveEvent(db, "events-a", { title: "Private event" }, now)).id,
      list: async (userId) => (await listEvents(db, userId, {}, now)).map((event) => event.id),
      update: async (userId, id) =>
        (await updateEvent(db, userId, id, { title: "Changed" }, now)) ? 1 : 0,
      remove: (userId, id) => removeEvent(db, userId, id),
      readOwnerValue: async (id) => {
        expect(await getEvent(db, "events-b", id)).toBeNull();
        return (await getEvent(db, "events-a", id))?.title ?? null;
      },
      expectedOwnerValue: "Private event",
    });
  });

  it("enriches a chosen public event URL from OG title without inventing dates", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          '<html><head><meta content="AI &amp; Humans" property="og:title"><title>Wrong fallback</title></head></html>',
          { headers: { "content-type": "text/html" } },
        ),
    );
    const result = await call("save_event", { url: "https://lu.ma/test-event" });
    expect(result.structuredContent).toMatchObject({
      event: { title: "AI & Humans", startsAt: null },
      metadata: { status: "enriched" },
    });
    expect(
      (await call("save_event", { url: "https://lu.ma/test-event", title: "User-confirmed title" }))
        .structuredContent,
    ).toMatchObject({ event: { title: "User-confirmed title" } });
  });

  it("saves supplied facts when metadata fails, redirects, is oversized, or is not allowlisted", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await call("save_event", { title: "Confirmed talk", url: "https://lu.ma/fails" }))
        .structuredContent,
    ).toMatchObject({ event: { title: "Confirmed talk" }, metadata: { status: "unavailable" } });
    fetcher.mockImplementation(
      async () => new Response("", { status: 302, headers: { location: "http://127.0.0.1" } }),
    );
    expect(
      (await call("save_event", { url: "https://lu.ma/redirect" })).structuredContent,
    ).toMatchObject({ metadata: { status: "unavailable" } });
    fetcher.mockImplementation(
      async () =>
        new Response("<title>Too large</title>", {
          headers: { "content-length": "9999999", "content-type": "text/html" },
        }),
    );
    expect(
      (await call("save_event", { url: "https://lu.ma/huge" })).structuredContent,
    ).toMatchObject({ metadata: { status: "unavailable" } });
    const requests = fetcher.mock.calls.length;
    await call("save_event", { url: "https://127.0.0.1/private" });
    expect(fetcher.mock.calls.length).toBe(requests);
  });
});

it("enriches metadata using Workers manual redirects and refuses 3xx responses", async () => {
  const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
    if (init.redirect !== "manual") throw new TypeError("Unsupported redirect mode in Workers");
    return new Response('<meta property="og:title" content="Workers-compatible event">', {
      headers: { "content-type": "text/html" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  expect(
    (await call("save_event", { url: "https://lu.ma/runtime" })).structuredContent,
  ).toMatchObject({
    event: { title: "Workers-compatible event" },
    metadata: { status: "enriched" },
  });
  fetcher.mockImplementation(
    async () =>
      new Response("", { status: 302, headers: { location: "https://untrusted.example/private" } }),
  );
  expect(
    (await call("save_event", { title: "Chosen event", url: "https://lu.ma/redirect" }))
      .structuredContent,
  ).toMatchObject({ event: { title: "Chosen event" }, metadata: { status: "unavailable" } });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps upcoming events visible beyond 100 past rows and filters before limiting", async () => {
  const history = Array.from({ length: 100 }, (_, index) => ({
    id: `history-${index}`,
    userId: "events-a",
    title: `Past event ${index}`,
    startsAt: now - (index + 1) * 60_000,
    source: "manual",
    status: "attended",
    createdAt: now,
    updatedAt: now,
  }));
  for (let offset = 0; offset < history.length; offset += 10)
    await db.insert(savedEvents).values(history.slice(offset, offset + 10));
  await call("save_event", { title: "Future event", startsAt: now + 60_000, status: "going" });
  const all = await call("list_events", { limit: 100 });
  expect((all.structuredContent?.events as { title: string }[] | undefined)?.[0]?.title).toBe(
    "Future event",
  );
  expect(
    (await call("list_events", { period: "upcoming", limit: 100 })).structuredContent,
  ).toMatchObject({ events: [expect.objectContaining({ title: "Future event" })] });
  expect(
    (await call("list_events", { status: "going", limit: 100 })).structuredContent,
  ).toMatchObject({ events: [expect.objectContaining({ title: "Future event" })] });
  expect((await call("list_events", { period: "past", limit: 1 })).structuredContent).toMatchObject(
    { events: [expect.objectContaining({ title: "Past event 0" })] },
  );
});

it("saves chosen facts when an unannounced metadata stream exceeds its size cap", async () => {
  let cancelled = false;
  let producedBytes = 0;
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            producedBytes += 100_000;
            controller.enqueue(new Uint8Array(100_000));
            if (producedBytes >= 1_000_000) controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/html" } },
      ),
  );
  expect(
    (await call("save_event", { title: "Confirmed event", url: "https://lu.ma/stream" }))
      .structuredContent,
  ).toMatchObject({ event: { title: "Confirmed event" }, metadata: { status: "unavailable" } });
  expect(cancelled).toBe(true);
  expect(producedBytes).toBeLessThanOrEqual(500_000);
});
