import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { authIdentities, contacts, jobs, profiles, users } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { coreTools } from "./tools";

interface TestEnv extends Env {
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as TestEnv;
const db = createDb(testEnv.DB);

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

function context(userId: string): ToolContext {
  return {
    userId,
    identity: { userId, name: userId },
    db,
    env: testEnv,
    now: () => new Date(1_800_000_000_000),
    log: createLogger("test"),
  };
}

async function call(name: string, args: Record<string, unknown>, userId: string) {
  const tool = coreTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool: ${name}`);
  return tool.handler(args as never, context(userId));
}

async function seedUsers() {
  const now = Date.now();
  await db.insert(users).values([
    { id: "user-a", displayName: "A", createdAt: now, updatedAt: now },
    { id: "user-b", displayName: "B", createdAt: now, updatedAt: now },
  ]);
  await db.insert(authIdentities).values({
    id: "identity-a",
    userId: "user-a",
    provider: "github",
    providerUserId: "101",
    createdAt: now,
    lastLoginAt: now,
  });
  await db.insert(profiles).values([
    { userId: "user-a", headline: "Private", updatedAt: now },
    { userId: "user-b", headline: "Keep me", updatedAt: now },
  ]);
  await db.insert(contacts).values([
    { id: "contact-a", userId: "user-a", name: "Delete me", createdAt: now, updatedAt: now },
    { id: "contact-b", userId: "user-b", name: "Keep me", createdAt: now, updatedAt: now },
  ]);
  await db.insert(jobs).values({
    id: "global-job",
    source: "seed",
    sourceJobId: "global-job",
    company: "Public Co",
    title: "Engineer",
    url: "https://example.com/job",
    fetchedAt: now,
    lastSeenAt: now,
  });
}

describe("core destructive tools", () => {
  it("requires confirmation and resets only the caller", async () => {
    await seedUsers();

    const refused = await call("reset_my_data", { confirm: "nope" }, "user-a");
    expect(refused.isError).toBe(true);
    expect(await db.select({ count: sql<number>`count(*)` }).from(contacts).get()).toEqual({
      count: 2,
    });

    const reset = await call("reset_my_data", { confirm: "RESET" }, "user-a");
    expect(reset.isError).not.toBe(true);
    expect(await db.select().from(contacts).where(eq(contacts.userId, "user-a"))).toEqual([]);
    expect(await db.select().from(contacts).where(eq(contacts.userId, "user-b"))).toHaveLength(1);
    expect(
      await db.select().from(authIdentities).where(eq(authIdentities.userId, "user-a")),
    ).toHaveLength(1);
    expect(await db.select().from(jobs)).toHaveLength(1);

    const profileA = await db.select().from(profiles).where(eq(profiles.userId, "user-a")).get();
    const profileB = await db.select().from(profiles).where(eq(profiles.userId, "user-b")).get();
    expect(profileA?.headline).toBeNull();
    expect(profileA?.criteriaVersion).toBe(2);
    expect(profileB?.headline).toBe("Keep me");
  });

  it("loads demo data idempotently", async () => {
    const now = Date.now();
    await db
      .insert(users)
      .values({ id: "demo-user", displayName: "Demo", createdAt: now, updatedAt: now });

    const first = await call("load_demo_data", {}, "demo-user");
    const firstContacts = await db.select().from(contacts).where(eq(contacts.userId, "demo-user"));
    const second = await call("load_demo_data", {}, "demo-user");
    const secondContacts = await db.select().from(contacts).where(eq(contacts.userId, "demo-user"));

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    expect(firstContacts.length).toBeGreaterThan(0);
    expect(secondContacts).toHaveLength(firstContacts.length);
    expect(new Set(secondContacts.map((contact) => contact.id)).size).toBe(secondContacts.length);
  });
});
