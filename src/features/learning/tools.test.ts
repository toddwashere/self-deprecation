import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { learningEntries, users } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { learningFeature as feature } from "./index";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
const now = 1_800_000_000_000;
beforeAll(() => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(learningEntries);
  await db.delete(users);
  await db
    .insert(users)
    .values(["learning-a", "learning-b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
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
async function call(name: string, args: Record<string, unknown>, userId = "learning-a") {
  const tool = feature.tools.find((candidate) => candidate.name === name);
  expect(tool, `missing ${name}`).toBeDefined();
  if (!tool) throw new Error(`Missing ${name}`);
  const result = await tool.handler(args as never, context(userId));
  if (!result.isError) expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
  return result;
}
const entry = {
  title: "Reliable agents talk",
  kind: "talk",
  body: "Keep this exact wording.\n\nA second paragraph.",
  sourceTitle: "Local engineering meetup",
  sourceUrl: "https://example.org/talk",
  author: "Example speaker",
  takeaways: ["Verify every boundary"],
  followUpQuestions: ["How should retries work?"],
  nextActions: ["Try a bounded experiment"],
  tags: ["agents"],
  occurredAt: now - 1000,
};
const notFound = { isError: true, _meta: { "self-deprecation/error": { code: "NOT_FOUND" } } };
const invalid = { isError: true, _meta: { "self-deprecation/error": { code: "INVALID_INPUT" } } };

describe("Learning journal T1/T4", () => {
  it("captures a complete quick reference and preserves wording on partial update", async () => {
    const saved = await call("save_learning_entry", entry);
    expect(saved.structuredContent).toMatchObject({
      tab: "learning",
      entry: { ...entry, pinned: false, archived: false },
    });
    const id = (saved.structuredContent?.entry as { id: string }).id;
    expect((await call("get_learning_entry", { entryId: id })).structuredContent).toMatchObject({
      entry,
    });
    expect(
      (await call("update_learning_entry", { entryId: id, pinned: true, sourceUrl: null }))
        .structuredContent,
    ).toMatchObject({ entry: { ...entry, pinned: true, sourceUrl: null } });
    expect((await call("list_learning_entries", {})).structuredContent).toMatchObject({
      entries: [expect.objectContaining({ id, pinned: true })],
      hasMore: false,
    });
  });

  it("isolates get/list/search/update-by-ID and ignores spoofed user identity (T1)", async () => {
    const saved = await call("save_learning_entry", { ...entry, userId: "learning-b" });
    const id = (saved.structuredContent?.entry as { id: string }).id;
    expect((await call("list_learning_entries", {}, "learning-b")).structuredContent).toMatchObject(
      { entries: [] },
    );
    expect(
      (await call("search_learning_entries", { query: "boundary" }, "learning-b"))
        .structuredContent,
    ).toMatchObject({ entries: [] });
    expect(await call("get_learning_entry", { entryId: id }, "learning-b")).toMatchObject(notFound);
    expect(
      await call(
        "update_learning_entry",
        { entryId: id, title: "Stolen", archived: true },
        "learning-b",
      ),
    ).toMatchObject(notFound);
    expect((await call("get_learning_entry", { entryId: id })).structuredContent).toMatchObject({
      entry,
    });
  });

  it("searches all quick-reference fields literally before pagination and filters by kind/tag/archive", async () => {
    await call("save_learning_entry", entry);
    await call("save_learning_entry", {
      title: "Another",
      kind: "reflection",
      body: "100% done",
      tags: ["personal"],
      pinned: true,
    });
    for (const query of [
      "RELIABLE",
      "exact wording",
      "engineering meetup",
      "example.org/talk",
      "Example speaker",
      "boundary",
      "retries",
      "bounded",
      "agents",
    ]) {
      expect(
        (await call("search_learning_entries", { query, limit: 1 })).structuredContent,
      ).toMatchObject({ entries: [expect.objectContaining({ title: entry.title })] });
    }
    expect((await call("search_learning_entries", { query: "%" })).structuredContent).toMatchObject(
      { entries: [expect.objectContaining({ title: "Another" })] },
    );
    expect((await call("search_learning_entries", { query: "_" })).structuredContent).toMatchObject(
      { entries: [] },
    );
    expect(
      (await call("list_learning_entries", { kind: "talk", tag: "agents" })).structuredContent,
    ).toMatchObject({ entries: [expect.objectContaining({ title: entry.title })] });
    const first = await call("list_learning_entries", { limit: 1 });
    expect(first.structuredContent).toMatchObject({
      entries: [expect.objectContaining({ title: "Another" })],
      hasMore: true,
    });
    expect(
      (await call("list_learning_entries", { limit: 1, offset: 1 })).structuredContent,
    ).toMatchObject({ entries: [expect.objectContaining({ title: entry.title })], hasMore: false });
    const id = (first.structuredContent?.entries as { id: string }[])[0]?.id;
    await call("update_learning_entry", { entryId: id, archived: true });
    expect((await call("list_learning_entries", {})).structuredContent).toMatchObject({
      entries: [expect.objectContaining({ title: entry.title })],
    });
    expect(
      (await call("list_learning_entries", { archived: true })).structuredContent,
    ).toMatchObject({ entries: [expect.objectContaining({ title: "Another" })] });
  });

  it("rejects invalid inputs without saving and leaves absent facts unknown", async () => {
    for (const args of [
      {},
      { title: " " },
      { title: "Talk", kind: "madeup" },
      { title: "Talk", sourceUrl: "javascript:alert(1)" },
      { title: "Talk", sourceUrl: "https://user:secret@example.org/" },
      { title: "Talk", body: "x".repeat(50001) },
      { title: "Talk", tags: [" "] },
    ]) {
      expect(await call("save_learning_entry", args)).toMatchObject(invalid);
    }
    expect(await call("update_learning_entry", { entryId: "missing" })).toMatchObject(invalid);
    expect(await call("search_learning_entries", { query: " " })).toMatchObject(invalid);
    expect(await call("list_learning_entries", { limit: 101 })).toMatchObject(invalid);
    expect(await call("get_learning_entry", { entryId: "missing" })).toMatchObject(notFound);
    expect((await call("list_learning_entries", {})).structuredContent).toMatchObject({
      entries: [],
    });
    expect(
      (await call("save_learning_entry", { title: "Reflection" })).structuredContent,
    ).toMatchObject({
      entry: {
        kind: "reference",
        sourceUrl: null,
        sourceTitle: null,
        occurredAt: null,
        takeaways: [],
        followUpQuestions: [],
        nextActions: [],
      },
    });
  });

  it("exports five uniquely named tools with required contracts and bounded status (T4)", () => {
    expect(feature.tools.map((tool) => tool.name).sort()).toEqual([
      "get_learning_entry",
      "list_learning_entries",
      "save_learning_entry",
      "search_learning_entries",
      "update_learning_entry",
    ]);
    for (const tool of feature.tools) {
      expect(tool.output).toBeDefined();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(tool.status.invoking.length).toBeLessThanOrEqual(64);
      expect(tool.status.invoked.length).toBeLessThanOrEqual(64);
      expect(tool.description).toContain("Next:");
      expect(Object.keys(tool.input)).not.toContain("userId");
    }
  });
});
