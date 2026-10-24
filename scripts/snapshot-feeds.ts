import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import boards from "../seed/ats-boards.json";
import type { Env } from "../src/env";
import { createAshbyAdapter } from "../src/sources/adapters/ashby";
import { createGreenhouseAdapter } from "../src/sources/adapters/greenhouse";
import { createLeverAdapter } from "../src/sources/adapters/lever";
import { type SnapshotJob, snapshotJob } from "../src/sources/adapters/snapshot";

// Optional recorded directory allows repeatable, offline regeneration after public feed verification.
// Original free-text descriptions are never written: snapshotJob constructs metadata-only summaries.
const recordedDirectory = process.argv
  .find((arg) => arg.startsWith("--recorded-dir="))
  ?.slice("--recorded-dir=".length);
const capturedAt = Date.now();
const grouped: Record<string, SnapshotJob[]> = { utah: [], ai: [], remote: [] };
const counts: Record<string, number> = {};
for (const board of boards.filter((board) => board.responseBytes <= 2_000_000)) {
  const options = {
    id: `${board.source}_${board.token}`,
    boardToken: board.token,
    company: board.company,
    ...(recordedDirectory
      ? {
          fetcher: async () =>
            new Response(
              await readFile(
                resolve(recordedDirectory, `${board.source}-${board.token}.json`),
                "utf8",
              ),
            ),
        }
      : {}),
  };
  const adapter =
    board.source === "greenhouse"
      ? createGreenhouseAdapter(options)
      : board.source === "lever"
        ? createLeverAdapter(options)
        : createAshbyAdapter(options);
  try {
    const jobs = await adapter.fetch({} as Env, { limit: 100 });
    counts[board.source] = (counts[board.source] ?? 0) + jobs.length;
    grouped[board.group].push(
      ...jobs
        .filter((job) => /engineer|developer|scientist|machine learning|technical/i.test(job.title))
        .map((job) => snapshotJob(job, capturedAt)),
    );
  } catch {
    console.warn(`Skipped ${adapter.id}: unavailable or over response budget`);
  }
}
const selected = Object.values(grouped).flatMap((jobs) => jobs.slice(0, 20));
const selectedIds = new Set(selected.map((job) => job.jobId));
for (const job of Object.values(grouped).flat()) {
  if (selected.length >= 60) break;
  if (!selectedIds.has(job.jobId)) {
    selected.push(job);
    selectedIds.add(job.jobId);
  }
}
if (selected.length < 60)
  throw new Error(`Only ${selected.length} relevant jobs found; existing snapshot preserved`);
const path = resolve("seed/jobs-snapshot.json");
const previous = JSON.parse(await readFile(path, "utf8")) as {
  jobId: string;
  jobText: string;
  source?: string;
}[];
// Retain the five legacy synthetic Decisions smoke examples without treating them as real listings.
const legacy = previous.filter((job) => !job.source).slice(0, 5);
await writeFile(path, `${JSON.stringify([...legacy, ...selected], null, 2)}\n`);
console.log(
  JSON.stringify({
    capturedAt,
    normalizedBySource: counts,
    snapshotJobs: selected.length,
    groups: Object.fromEntries(
      Object.entries(grouped).map(([group, jobs]) => [group, jobs.length]),
    ),
  }),
);
