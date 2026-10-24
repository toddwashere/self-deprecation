import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { fetchRuns, jobs } from "../db/schema";
import type { Env } from "../env";
import type { NormalizedJob, SourceAdapter } from "../sources/types";
import { dispatchCron } from "./dispatcher";

interface TestEnv extends Env {
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as TestEnv;
const db = createDb(testEnv.DB);

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await db.delete(fetchRuns);
  await db.delete(jobs);
});

describe("cron dispatcher", () => {
  it("upserts successful jobs and records one failed source without aborting others", async () => {
    const good: SourceAdapter<NormalizedJob> = {
      id: "good",
      kind: "jobs",
      fetch: async () => [
        {
          source: "good",
          sourceJobId: "1",
          company: "Good Co",
          title: "Engineer",
          employmentType: "full_time",
          url: "https://example.com/jobs/1",
        },
      ],
    };
    const bad: SourceAdapter<NormalizedJob> = {
      id: "bad",
      kind: "jobs",
      fetch: async () => {
        throw new Error("feed unavailable");
      },
    };

    const result = await dispatchCron(testEnv, "0 */4 * * *", {
      adapters: [bad, good],
      now: () => 1_800_000_000_000,
    });

    expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1, itemsUpserted: 1 });
    expect(await db.select().from(jobs)).toHaveLength(1);
    expect((await db.select().from(fetchRuns)).map((run) => run.status).sort()).toEqual([
      "error",
      "ok",
    ]);
  });
});
