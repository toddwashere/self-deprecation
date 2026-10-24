import { createDb } from "../db/client";
import type { Env } from "../env";
import { finishFetchRun, startFetchRun, upsertJobs } from "../features/jobs/repo";
import { runRotatingJobBatch } from "../features/jobs/service";
import { upsertNews } from "../features/news/repo";
import { SOURCES } from "../sources/registry";
import type {
  AnySourceAdapter,
  NormalizedJob,
  NormalizedNews,
  SourceAdapter,
} from "../sources/types";

export interface CronSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  itemsUpserted: number;
}

interface DispatchOptions {
  adapters?: readonly AnySourceAdapter[];
  now?: () => number;
  runJobBatch?: typeof runRotatingJobBatch;
}

function jobBatchSummary(result: Awaited<ReturnType<typeof runRotatingJobBatch>>): CronSummary {
  const failed = result.sources.filter((source) => source.status === "error").length;
  return {
    attempted: result.sources.length,
    succeeded: result.sources.length - failed,
    failed,
    itemsUpserted: result.itemsUpserted,
  };
}

function adaptersForCron(cron: string, adapters: readonly AnySourceAdapter[]) {
  if (cron === "0 12 * * *") return adapters.filter((adapter) => adapter.kind === "news");
  if (cron === "30 6 * * *") {
    return adapters.filter((adapter) => ["hn_hiring", "hn_freelance"].includes(adapter.id));
  }
  return adapters.filter(
    (adapter) => adapter.kind === "jobs" && !["hn_hiring", "hn_freelance"].includes(adapter.id),
  );
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown source failure";
  return message.replace(/\s+/g, " ").slice(0, 500);
}

export async function dispatchCron(
  env: Env,
  cron: string,
  options: DispatchOptions = {},
): Promise<CronSummary> {
  if (cron === "0 */4 * * *" && (options.runJobBatch || !options.adapters)) {
    const runJobBatch = options.runJobBatch ?? runRotatingJobBatch;
    return jobBatchSummary(await runJobBatch(env));
  }
  const db = createDb(env.DB);
  const now = options.now ?? Date.now;
  const adapters = adaptersForCron(cron, options.adapters ?? SOURCES);
  const summary: CronSummary = {
    attempted: adapters.length,
    succeeded: 0,
    failed: 0,
    itemsUpserted: 0,
  };

  for (const adapter of adapters) {
    const startedAt = now();
    const runId = await startFetchRun(db, adapter.id, adapter.kind, startedAt);
    try {
      let count: number;
      if (adapter.kind === "jobs") {
        const items = await (adapter as SourceAdapter<NormalizedJob>).fetch(env, { limit: 100 });
        count = await upsertJobs(db, items, now());
      } else {
        const items = await (adapter as SourceAdapter<NormalizedNews>).fetch(env, { limit: 20 });
        count = await upsertNews(db, items, now());
      }
      await finishFetchRun(db, runId, { status: "ok", itemsUpserted: count }, now());
      summary.succeeded += 1;
      summary.itemsUpserted += count;
    } catch (error) {
      await finishFetchRun(
        db,
        runId,
        { status: "error", itemsUpserted: 0, error: safeError(error) },
        now(),
      );
      summary.failed += 1;
    }
  }

  return summary;
}
