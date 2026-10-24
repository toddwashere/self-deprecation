import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { assertUserIsolation } from "./isolation-test-helper";
import { schemaTableNames } from "./schema";

interface TestEnv {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as TestEnv;

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe("foundation schema", () => {
  it("contains every frozen table from PLAN section 7", () => {
    expect(schemaTableNames).toEqual([
      "users",
      "auth_identities",
      "profiles",
      "jobs",
      "news_items",
      "fetch_runs",
      "job_matches",
      "contacts",
      "notes",
      "saved_events",
      "user_state",
      "ladder_assessments",
      "ladder_quests",
      "api_usage",
    ]);
  });

  it("provides a reusable user-isolation contract", async () => {
    const db = createDb(testEnv.DB);
    const now = Date.now();
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        "INSERT INTO users (id, display_name, is_demo, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
      ).bind("user-a", "A", now, now),
      testEnv.DB.prepare(
        "INSERT INTO users (id, display_name, is_demo, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
      ).bind("user-b", "B", now, now),
    ]);

    await assertUserIsolation({
      userA: "user-a",
      userB: "user-b",
      createForA: async () => {
        await testEnv.DB.prepare(
          "INSERT INTO contacts (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
          .bind("contact-a", "user-a", "Private contact", now, now)
          .run();
        return "contact-a";
      },
      list: async (userId) =>
        testEnv.DB.prepare("SELECT id FROM contacts WHERE user_id = ?")
          .bind(userId)
          .all<{ id: string }>()
          .then((result) => result.results.map((row) => row.id)),
      update: async (userId, id) =>
        testEnv.DB.prepare("UPDATE contacts SET name = ? WHERE user_id = ? AND id = ?")
          .bind("Changed", userId, id)
          .run()
          .then((result) => result.meta.changes),
      remove: async (userId, id) =>
        testEnv.DB.prepare("DELETE FROM contacts WHERE user_id = ? AND id = ?")
          .bind(userId, id)
          .run()
          .then((result) => result.meta.changes),
      readOwnerValue: async (id) =>
        testEnv.DB.prepare("SELECT name FROM contacts WHERE id = ?").bind(id).first<string>("name"),
      expectedOwnerValue: "Private contact",
    });

    expect(db).toBeDefined();
  });
});
