import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { profiles, users } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { criteriaFeature } from "./index";

interface TestEnv extends Env {
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as TestEnv;
const db = createDb(testEnv.DB);

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await db.delete(profiles);
  await db.delete(users);
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
  const tool = criteriaFeature.tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool: ${name}`);
  return tool.handler(args as never, context(userId));
}

async function seedProfile(userId: string, values: Partial<typeof profiles.$inferInsert> = {}) {
  const now = 1_700_000_000_000;
  await db
    .insert(users)
    .values({ id: userId, displayName: userId, createdAt: now, updatedAt: now });
  await db.insert(profiles).values({ userId, updatedAt: now, ...values });
}

describe("criteria tools", () => {
  it("derives profile ownership from context for reads and partial updates", async () => {
    await seedProfile("criteria-a", { targetTitles: ["Staff Engineer"], skills: ["typescript"] });
    const now = 1_700_000_000_000;
    await db
      .insert(users)
      .values({ id: "criteria-b", displayName: "criteria-b", createdAt: now, updatedAt: now });

    const forgedRead = await call("get_criteria", { userId: "criteria-a" }, "criteria-b");
    const forgedUpdate = await call(
      "update_criteria",
      { userId: "criteria-a", salaryMin: 200_000 },
      "criteria-b",
    );
    const profileA = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, "criteria-a"))
      .get();
    const profileB = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, "criteria-b"))
      .get();

    expect(forgedRead.structuredContent).toMatchObject({ targetTitles: [], skills: [] });
    expect(forgedUpdate.structuredContent).toMatchObject({ salaryMin: 200_000 });
    expect(profileA?.salaryMin).toBeNull();
    expect(profileB?.salaryMin).toBe(200_000);
  });

  it("preserves omitted criteria and bumps the version exactly once", async () => {
    await seedProfile("criteria-partial", {
      targetTitles: ["AI Product Engineer"],
      skills: ["typescript", "react"],
      criteriaVersion: 4,
    });

    const result = await call("update_criteria", { hourlyMin: 125 }, "criteria-partial");

    expect(result.structuredContent).toMatchObject({
      targetTitles: ["AI Product Engineer"],
      skills: ["typescript", "react"],
      hourlyMin: 125,
      criteriaVersion: 5,
    });
  });

  it("rejects oversized resumes and maps only supplied extraction fields", async () => {
    await seedProfile("criteria-resume", {
      targetTitles: ["Backend Engineer"],
      seniority: "senior",
      criteriaVersion: 2,
    });

    const rejected = await call("save_resume", { text: "x".repeat(50_001) }, "criteria-resume");
    const saved = await call(
      "save_resume",
      {
        text: "Public-safe resume text",
        extracted: { titles: ["Platform Engineer"], skills: ["Go", "Postgres"] },
      },
      "criteria-resume",
    );

    expect(rejected).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "INVALID_INPUT" } },
    });
    expect(saved.structuredContent).toMatchObject({
      targetTitles: ["Platform Engineer"],
      skills: ["go", "postgres"],
      seniority: "senior",
      hasResume: true,
      criteriaVersion: 3,
    });
  });

  it("starts headline-only users with the missing onboarding groups", async () => {
    await seedProfile("criteria-new", { headline: "Exploring what comes next" });

    const result = await call("start_onboarding", {}, "criteria-new");

    expect(result.structuredContent).toMatchObject({
      configured: false,
      missing: expect.arrayContaining(["targetTitles", "seniority", "workMode", "skills"]),
      questionGroups: expect.arrayContaining([
        expect.objectContaining({ id: "roles" }),
        expect.objectContaining({ id: "workplace" }),
      ]),
    });
  });
});
