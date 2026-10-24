import snapshot from "../../../seed/jobs-snapshot.json";
import type { NormalizedJob, SourceAdapter } from "../types";
import { selectJobs } from "./normalization";
import type { SnapshotJob } from "./snapshot";

const entries = (snapshot as unknown as Partial<SnapshotJob>[]).filter(
  (entry): entry is SnapshotJob =>
    Boolean(entry.source && entry.company && entry.title && entry.sourceJobId && entry.url),
);
export const SNAPSHOT_CAPTURED_AT = Math.min(...entries.map((entry) => entry.snapshotCapturedAt));

export const seedJobsAdapter: SourceAdapter<NormalizedJob> = {
  id: "seed",
  kind: "jobs",
  async fetch(_env, opts) {
    return selectJobs(
      entries.map((entry) => ({
        source: entry.source,
        sourceJobId: entry.sourceJobId,
        company: entry.company,
        title: entry.title,
        location: entry.location,
        remote: entry.remote,
        employmentType: entry.employmentType,
        salaryMin: entry.salaryMin,
        salaryMax: entry.salaryMax,
        currency: entry.currency,
        url: entry.url,
        descriptionText: entry.descriptionText,
        tags: [...(entry.tags ?? []), "snapshot"],
        postedAt: entry.postedAt,
      })),
      opts,
    );
  },
};
