import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, expect, it } from "vitest";
import demo from "../../../seed/demo-todd.json";
import { createDb } from "../../db/client";
import { apiUsage, jobMatches, jobs, profiles, userState, users } from "../../db/schema";
import type { Env } from "../../env";
import type { ToolContext } from "../../mcp/types";
import { jobsTools } from "./tools";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
const now = Date.UTC(2026, 9, 24);
const ctx: ToolContext = {
  db,
  userId: "a",
  identity: { userId: "a", name: "Test" },
  env: { ...bound, DECISIONS_ENABLED: "0" },
  now: () => new Date(now),
  log: { info() {}, warn() {}, error() {} },
};
beforeAll(async () => {
  await applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS);
});
beforeEach(async () => {
  await db.delete(apiUsage);
  await db.delete(jobMatches);
  await db.delete(userState);
  await db.delete(profiles);
  await db.delete(jobs);
  await db.delete(users);
  await db.insert(users).values(["a", "b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db.insert(profiles).values({ userId: "a", ...demo.profile, updatedAt: now });
  await db.insert(jobs).values({
    id: "job",
    source: "seed",
    sourceJobId: "job",
    company: "Example",
    title: "Senior Software Engineer",
    remote: true,
    location: "Remote US",
    employmentType: "full_time",
    salaryMin: 180000,
    salaryMax: 210000,
    currency: "USD",
    tags: ["typescript"],
    url: "https://example.com/job",
    fetchedAt: now,
    lastSeenAt: now,
  });
});
function tool(name: string) {
  const found = jobsTools.find((t) => t.name === name);
  expect(found, `${name} registered`).toBeDefined();
  if (!found) throw new Error(`${name} not registered`);
  return found;
}

it("T4 validates all owned tool outputs and rejects invalid input without accepting user IDs", async () => {
  for (const name of ["search_jobs", "get_job", "update_job_status", "score_jobs"]) {
    const selected = tool(name);
    const valid =
      name === "get_job"
        ? { jobId: "job" }
        : name === "update_job_status"
          ? { jobId: "job", status: "saved" }
          : {};
    const result = await selected.handler(valid, ctx);
    expect(result.isError).not.toBe(true);
    expect(selected.output?.safeParse(result.structuredContent).success).toBe(true);
    const invalid = await selected.handler({ ...valid, userId: "b" }, ctx);
    expect(invalid).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "INVALID_INPUT" } },
    });
    expect(selected.annotations).toMatchObject({ destructiveHint: false });
    expect(selected.status.invoking.length).toBeLessThanOrEqual(64);
    expect(selected.status.invoked.length).toBeLessThanOrEqual(64);
  }
  expect(
    await tool("update_job_status").handler({ jobId: "job", status: "garbage" }, ctx),
  ).toMatchObject({ isError: true });
});

it("T1 reads only the caller's status and requires their own criteria for search", async () => {
  await tool("update_job_status").handler({ jobId: "job", status: "saved" }, ctx);
  const other = await tool("get_job").handler({ jobId: "job" }, { ...ctx, userId: "b" });
  expect(other.structuredContent).toMatchObject({ job: { status: "new", fitScore: null } });
  expect(await tool("search_jobs").handler({}, { ...ctx, userId: "b" })).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "NEEDS_CRITERIA" } },
  });
  expect(await tool("get_job").handler({ jobId: "missing" }, ctx)).toMatchObject({
    isError: true,
    structuredContent: { error: { code: "NOT_FOUND" } },
  });
});

it("returns normalized initiating filters for panel refresh and continuation", async () => {
  await tool("update_job_status").handler({ jobId: "job", status: "saved" }, ctx);
  const result = await tool("search_jobs").handler(
    {
      query: "  engineer  ",
      status: "saved",
      remoteOnly: true,
      hideUnlistedSalary: true,
      limit: 7,
    },
    ctx,
  );
  expect(result.structuredContent).toMatchObject({
    filters: {
      query: "engineer",
      status: "saved",
      employmentType: "",
      remoteOnly: true,
      hideUnlistedSalary: true,
      limit: 7,
    },
  });
});
