import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { jobMatches, jobs, notes, profiles, users } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { prepFeature } from "./index";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
const now = 1_800_000_000_000;
const report = {
  company: "Migration Labs",
  role: "Senior Engineer",
  stages: [
    {
      name: "Technical screen",
      durationMinutes: 60,
      description: "Live coding",
      sourceUrls: ["https://example.com/process"],
    },
  ],
  coding: {
    patterns: [
      {
        name: "Graphs / BFS",
        difficulty: "medium",
        practiceLinks: [{ title: "Graph practice", url: "https://example.com/practice" }],
        sourceUrls: ["https://example.com/process"],
      },
    ],
    languages: ["TypeScript"],
    format: "Live coding",
  },
  systemDesign: {
    prompts: ["Design a rate limiter"],
    expectedDepth: "Explain tradeoffs",
    sourceUrls: ["https://example.com/process"],
  },
  behavioral: { themes: ["Collaboration"], sourceUrls: ["https://example.com/process"] },
  tips: ["Explain assumptions"],
  redFlags: [],
  confidence: "low",
  sources: [
    { title: "Public interview process", url: "https://example.com/process", date: "2026-10-01" },
  ],
  lastResearchedAt: now,
};

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});
beforeEach(async () => {
  await db.delete(notes);
  await db.delete(jobMatches);
  await db.delete(profiles);
  await db.delete(users);
  await db.delete(jobs);
  await db
    .insert(users)
    .values(["prep-a", "prep-b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db.insert(profiles).values([
    { userId: "prep-a", skills: ["typescript"], resumeText: "Private resume", updatedAt: now },
    { userId: "prep-b", skills: ["go"], updatedAt: now },
  ]);
  await db.insert(jobs).values({
    id: "prep-job",
    source: "seed",
    sourceJobId: "prep-job",
    company: "Migration Labs",
    title: "Senior Engineer",
    url: "https://example.com/job",
    descriptionText: "Build reliable systems",
    fetchedAt: now,
    lastSeenAt: now,
  });
  await db.insert(jobMatches).values({
    id: "prep-match-a",
    userId: "prep-a",
    jobId: "prep-job",
    status: "saved",
    criteriaVersion: 1,
    updatedAt: now,
  });
});

async function call(name: string, args: Record<string, unknown>, userId = "prep-a") {
  const tool = prepFeature.tools.find((candidate) => candidate.name === name);
  expect(tool, `registered ${name}`).toBeDefined();
  if (!tool) throw new Error(`Missing tool ${name}`);
  const ctx: ToolContext = {
    userId,
    identity: { userId, name: userId },
    db,
    env: testEnv,
    now: () => new Date(now),
    log: createLogger("test"),
  };
  const result = await tool.handler(args as never, ctx);
  if (!result.isError) expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
  return result;
}

function errorCode(result: Awaited<ReturnType<typeof call>>) {
  return (result._meta?.["self-deprecation/error"] as { code?: string } | undefined)?.code;
}

describe("prep isolation and contracts", () => {
  it("keeps overview, job context, company intel and note-ID updates owned by the caller", async () => {
    const saved = await call("save_prep", {
      jobId: "prep-job",
      title: "Study plan",
      body: "Practice graphs",
    });
    const prep = saved.structuredContent?.prep as { id: string };
    await call("save_interview_intel", { jobId: "prep-job", report });
    await db.insert(notes).values([
      {
        id: "related",
        userId: "prep-a",
        subjectType: "company",
        subjectLabel: "Migration Labs",
        kind: "note",
        body: "Team values reliability",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "unrelated",
        userId: "prep-a",
        subjectType: "company",
        subjectLabel: "Other",
        kind: "note",
        body: "Unrelated private note",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const overview = await call("get_prep_context", {});
    expect(overview.structuredContent).toMatchObject({
      savedJobs: [{ id: "prep-job", prepStatus: "ready" }],
      progress: { stage: "done" },
    });
    const context = await call("get_prep_context", { jobId: "prep-job" });
    expect(context.structuredContent).toMatchObject({
      job: { id: "prep-job", company: "Migration Labs" },
      profile: { skills: ["typescript"] },
      prep: [{ title: "Study plan" }],
      relatedNotes: [{ id: "related" }],
      intel: [{ report: { coding: { patterns: [{ name: "Graphs / BFS" }] } } }],
    });
    expect(JSON.stringify(context.structuredContent)).not.toContain("Private resume");
    expect(
      (await call("get_prep_context", { userId: "prep-a" }, "prep-b")).structuredContent,
    ).toMatchObject({ savedJobs: [], prep: [], intel: [], profile: { skills: ["go"] } });
    expect(errorCode(await call("get_prep_context", { jobId: "prep-job" }, "prep-b"))).toBe(
      "NOT_FOUND",
    );
    expect(
      errorCode(
        await call(
          "save_prep",
          { jobId: "prep-job", noteId: prep.id, title: "Attack", body: "Overwrite" },
          "prep-b",
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(errorCode(await call("get_interview_intel", { jobId: "prep-job" }, "prep-b"))).toBe(
      "NOT_FOUND",
    );
    expect(
      (await call("get_interview_intel", { company: "Migration Labs" }, "prep-b"))
        .structuredContent,
    ).toMatchObject({ intel: [] });
    await db.insert(jobMatches).values({
      id: "prep-match-b",
      userId: "prep-b",
      jobId: "prep-job",
      status: "saved",
      criteriaVersion: 1,
      updatedAt: now,
    });
    expect(
      errorCode(
        await call(
          "save_prep",
          { jobId: "prep-job", noteId: prep.id, title: "Attack", body: "Overwrite" },
          "prep-b",
        ),
      ),
    ).toBe("NOT_FOUND");
    await call("save_interview_intel", { report: { ...report, tips: ["B's report"] } }, "prep-b");
    expect(
      (await call("get_interview_intel", { company: "Migration Labs" })).structuredContent,
    ).toMatchObject({ intel: [{ report: { tips: ["Explain assumptions"] } }] });
    const updated = await call("save_prep", {
      jobId: "prep-job",
      noteId: prep.id,
      title: "Updated plan",
      body: "Practice intervals",
    });
    expect(updated.structuredContent).toMatchObject({
      prep: { id: prep.id, body: "Practice intervals" },
    });
    expect((await db.select().from(notes).where(eq(notes.id, prep.id)).get())?.userId).toBe(
      "prep-a",
    );
  });

  it("keeps each saved job prepared when another job has over 100 newer notes", async () => {
    await db.insert(jobs).values({
      id: "prep-older-job",
      source: "seed",
      sourceJobId: "prep-older-job",
      company: "Other Labs",
      title: "Staff Engineer",
      url: "https://example.com/older-job",
      fetchedAt: now,
      lastSeenAt: now,
    });
    await db.insert(jobMatches).values({
      id: "prep-older-match",
      userId: "prep-a",
      jobId: "prep-older-job",
      status: "saved",
      criteriaVersion: 1,
      updatedAt: now,
    });
    await db.insert(notes).values({
      id: "prep-older-note",
      userId: "prep-a",
      subjectType: "job",
      subjectId: "prep-older-job",
      kind: "prep",
      title: "Earlier plan",
      body: "Practice design",
      createdAt: now - 1,
      updatedAt: now - 1,
    });
    for (let index = 0; index < 101; index += 1) {
      await db.insert(notes).values({
        id: `prep-history-${index}`,
        userId: "prep-a",
        subjectType: "job",
        subjectId: "prep-job",
        kind: "prep",
        title: "Practice summary",
        body: "Practice graphs",
        createdAt: now,
        updatedAt: now + index,
      });
    }
    const overview = await call("get_prep_context", {});
    expect(overview.structuredContent?.savedJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "prep-job", prepStatus: "ready" }),
        expect.objectContaining({ id: "prep-older-job", prepStatus: "ready" }),
      ]),
    );
  });

  it("rejects invalid, uncited, oversized and unsafe report input before writing", async () => {
    for (const invalid of [
      { ...report, sources: [] },
      { ...report, sources: [{ title: "Bad", url: "javascript:alert(1)", date: null }] },
      {
        ...report,
        stages: [
          {
            name: "Unknown",
            description: "Claims",
            sourceUrls: ["https://example.com/missing-citation"],
          },
        ],
      },
      { ...report, confidence: "high", sources: [] },
      { ...report, lastResearchedAt: now + 86_400_000 },
    ])
      expect(errorCode(await call("save_interview_intel", { report: invalid }))).toBe(
        "INVALID_INPUT",
      );
    expect(errorCode(await call("save_interview_intel", { jobId: "missing", report }))).toBe(
      "NOT_FOUND",
    );
    expect(
      errorCode(
        await call("save_prep", { jobId: "prep-job", title: "Too long", body: "x".repeat(50_001) }),
      ),
    ).toBe("INVALID_INPUT");
    expect(await db.select().from(notes)).toHaveLength(0);
  });

  it("reuses company intel by role, updates only that role, and tolerates legacy malformed notes", async () => {
    await call("save_interview_intel", { report });
    await call("save_interview_intel", {
      report: { ...report, company: " migration labs ", tips: ["Updated"] },
    });
    await call("save_interview_intel", { report: { ...report, role: "Staff Engineer" } });
    await db.insert(notes).values({
      id: "legacy",
      userId: "prep-a",
      subjectType: "company",
      subjectId: "migration labs",
      kind: "interview_intel",
      body: "legacy text",
      createdAt: now,
      updatedAt: now,
    });
    const result = await call("get_interview_intel", {
      company: "Migration Labs",
      role: "Senior Engineer",
    });
    expect(result.structuredContent).toMatchObject({ intel: [{ report: { tips: ["Updated"] } }] });
    expect(result.structuredContent?.intel).toHaveLength(1);
    const all = await call("get_interview_intel", { jobId: "prep-job" });
    expect(all.structuredContent?.intel).toHaveLength(2);
  });
});
