import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { jobs, profiles, users } from "../../db/schema";
import type { Env } from "../../env";
import type { ToolContext } from "../../mcp/types";
import { contractLeadsOutputSchema, contractTools } from "./tools";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
beforeAll(() => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(jobs);
  await db.delete(profiles);
  await db.delete(users);
  await db
    .insert(users)
    .values({ id: "tool-user", displayName: "Tool", createdAt: 1, updatedAt: 1 });
  await db
    .insert(profiles)
    .values({ userId: "tool-user", bridgeMode: false, criteriaVersion: 1, updatedAt: 1 });
  await db.insert(jobs).values({
    id: "lead",
    source: "hn_freelance",
    sourceJobId: "lead",
    company: "Example",
    title: "Contract Engineer",
    remote: true,
    employmentType: "contract",
    url: "https://news.ycombinator.com/item?id=1",
    tags: ["contract"],
    fetchedAt: 2,
    lastSeenAt: 2,
  });
});

function context(): ToolContext {
  return {
    userId: "tool-user",
    identity: { userId: "tool-user", name: "Tool" },
    db,
    env: testEnv,
    now: () => new Date(100),
    log: { info() {}, warn() {}, error() {} },
  };
}

function tool(name: string) {
  const found = contractTools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

it("requires Bridge mode before listing and rejects invalid input", async () => {
  const off = await tool("list_contract_leads").handler({}, context());
  expect(off.isError).toBe(true);
  expect(off._meta?.["self-deprecation/error"]).toMatchObject({ code: "NEEDS_CRITERIA" });
  const invalid = await tool("list_contract_leads").handler({ limit: 0 }, context());
  expect(invalid.isError).toBe(true);
  expect(invalid._meta?.["self-deprecation/error"]).toMatchObject({ code: "INVALID_INPUT" });
});

it("enables Bridge mode and returns a Jobs-compatible contract result", async () => {
  const enabled = await tool("set_bridge_mode").handler({ enabled: true }, context());
  expect(enabled.isError).not.toBe(true);
  expect(enabled.structuredContent).toMatchObject({ bridgeMode: true, criteriaVersion: 2 });

  const listed = await tool("list_contract_leads").handler({ remoteOnly: true }, context());
  expect(listed.isError).not.toBe(true);
  expect(contractLeadsOutputSchema.safeParse(listed.structuredContent).success).toBe(true);
  expect(listed.structuredContent).toMatchObject({
    tab: "jobs",
    bridgeMode: true,
    filters: { employmentType: "contract", remoteOnly: true },
    jobs: [{ id: "lead", employmentType: "contract" }],
    progress: { stage: "done", done: 1, total: 1 },
  });
});
