import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { jobMatches, jobs, profiles, users } from "../../db/schema";
import type { Env } from "../../env";
import { getBridgeProfile, listContractLeads, setBridgeMode } from "./repo";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);

beforeAll(() => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(jobMatches);
  await db.delete(jobs);
  await db.delete(profiles);
  await db.delete(users);
  await db.insert(users).values([
    { id: "bridge-a", displayName: "A", createdAt: 1, updatedAt: 1 },
    { id: "bridge-b", displayName: "B", createdAt: 1, updatedAt: 1 },
  ]);
  await db.insert(profiles).values([
    { userId: "bridge-a", bridgeMode: false, criteriaVersion: 1, updatedAt: 1 },
    { userId: "bridge-b", bridgeMode: false, criteriaVersion: 1, updatedAt: 1 },
  ]);
  await db.insert(jobs).values([
    {
      id: "contract-one",
      source: "hn_freelance",
      sourceJobId: "1",
      company: "Migration Labs",
      title: "Contract TypeScript Engineer",
      location: "Remote US",
      remote: true,
      employmentType: "contract",
      url: "https://news.ycombinator.com/item?id=1",
      descriptionText: "A bounded TypeScript engagement.",
      tags: ["typescript", "contract"],
      postedAt: 10,
      fetchedAt: 20,
      lastSeenAt: 20,
    },
    {
      id: "full-time",
      source: "hn_hiring",
      sourceJobId: "2",
      company: "Permanent Corp",
      title: "Backend Engineer",
      remote: false,
      employmentType: "full_time",
      url: "https://news.ycombinator.com/item?id=2",
      tags: [],
      fetchedAt: 20,
      lastSeenAt: 20,
    },
  ]);
});

it("T1 keeps Bridge mode and caller match state isolated while sharing public leads", async () => {
  const a = await setBridgeMode(db, "bridge-a", true, 30);
  expect(a).toMatchObject({ bridgeMode: true, criteriaVersion: 2 });
  expect(await getBridgeProfile(db, "bridge-b")).toMatchObject({
    bridgeMode: false,
    criteriaVersion: 1,
  });

  await db.insert(jobMatches).values({
    id: "match-a",
    userId: "bridge-a",
    jobId: "contract-one",
    criteriaVersion: 2,
    status: "saved",
    fitScore: 90,
    scoreSource: "decisions",
    reasons: ["A-only evidence"],
    updatedAt: 30,
  });

  const leadsA = await listContractLeads(db, "bridge-a", { limit: 20 });
  const leadsB = await listContractLeads(db, "bridge-b", { limit: 20 });
  expect(leadsA.jobs).toHaveLength(1);
  expect(leadsA.jobs[0]).toMatchObject({ status: "saved", fitScore: 90 });
  expect(leadsB.jobs).toHaveLength(1);
  expect(leadsB.jobs[0]).toMatchObject({ status: "new", fitScore: null, reasons: ["Contract"] });
});

it("filters public contract leads without admitting full-time rows", async () => {
  await setBridgeMode(db, "bridge-a", true, 30);
  expect(
    (await listContractLeads(db, "bridge-a", { query: "typescript", limit: 10 })).jobs,
  ).toHaveLength(1);
  expect((await listContractLeads(db, "bridge-a", { query: "python", limit: 10 })).jobs).toEqual(
    [],
  );
  expect(
    (await listContractLeads(db, "bridge-a", { remoteOnly: true, limit: 10 })).jobs,
  ).toHaveLength(1);
});
