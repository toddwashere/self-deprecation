import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { apiUsage, notes, userState, users } from "../../db/schema";
import type { Env } from "../../env";
import type { CompanyDossier } from "./agent";
import { claimDossierRun, getDossierTask, listDossiers, putDossierTask, saveDossier } from "./repo";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
const now = Date.UTC(2026, 9, 24, 12);
const dossier: CompanyDossier = {
  company: "Example Labs",
  website: "https://example.com",
  summary: "Developer infrastructure.",
  recentNews: [],
  engineeringSignals: [],
  roleTypes: [{ role: "Engineering manager", why: "Team context." }],
  sources: [{ title: "Example Labs", url: "https://example.com" }],
  researchedAt: now,
};

beforeAll(async () => applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(apiUsage);
  await db.delete(notes);
  await db.delete(userState);
  await db.delete(users);
  await db.insert(users).values([
    { id: "a", displayName: "A", createdAt: now, updatedAt: now },
    { id: "b", displayName: "B", createdAt: now, updatedAt: now },
  ]);
});

describe("dossier repository", () => {
  it("atomically enforces per-user and global daily attempt caps", async () => {
    const limits = { user: 3, global: 4, since: Date.UTC(2026, 9, 24) };
    expect(await claimDossierRun(db, "a", limits, now)).toBe("ok");
    expect(await claimDossierRun(db, "a", limits, now + 1)).toBe("ok");
    expect(await claimDossierRun(db, "a", limits, now + 2)).toBe("ok");
    expect(await claimDossierRun(db, "a", limits, now + 3)).toBe("user_limit");
    expect(await claimDossierRun(db, "b", limits, now + 4)).toBe("ok");
    expect(await claimDossierRun(db, "b", limits, now + 5)).toBe("global_limit");
    expect(await db.select().from(apiUsage)).toHaveLength(4);
  });

  it("keeps saved dossiers isolated by user", async () => {
    await saveDossier(db, "a", "Example Labs", dossier, now);
    expect(await listDossiers(db, "b", "Example Labs")).toEqual([]);
    const own = await listDossiers(db, "a", "Example Labs");
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      subjectType: "company",
      subjectLabel: "Example Labs",
      kind: "dossier",
    });
    expect(JSON.parse(own[0]?.body ?? "{}")).toMatchObject({ company: "Example Labs" });
  });

  it("keeps asynchronous agent session state isolated by user", async () => {
    await putDossierTask(
      db,
      "a",
      {
        taskId: "dossier-1",
        sessionId: "session-private",
        company: "Example Labs",
        researchedAt: now,
        status: "researching",
      },
      now,
    );

    expect(await getDossierTask(db, "b", "dossier-1")).toBeUndefined();
    expect(await getDossierTask(db, "a", "dossier-1")).toMatchObject({
      sessionId: "session-private",
      status: "researching",
    });
  });
});
