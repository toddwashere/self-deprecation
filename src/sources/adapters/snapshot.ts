import { SKILLS } from "../../lib/skills-dict";
import type { NormalizedJob } from "../types";
import { cleanDescription } from "./normalization";

export interface SnapshotJob extends NormalizedJob {
  jobId: string;
  jobText: string;
  snapshotCapturedAt: number;
}

function publicText(value: string): string {
  return cleanDescription(value)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, "")
    .trim();
}

export function snapshotJob(job: NormalizedJob, snapshotCapturedAt: number): SnapshotJob {
  const company = publicText(job.company);
  const title = publicText(job.title);
  const location = job.location ? publicText(job.location) : undefined;
  const tags = SKILLS.filter((skill) => job.tags?.includes(skill));
  const descriptionText = `${title} at ${company}.${location ? ` ${location}.` : ""}${tags.length ? ` Skills: ${tags.join(", ")}.` : ""}`;
  const role = /staff|senior|principal|ai/i.exec(title)?.[0].toLowerCase() ?? "role";
  // Explicit allowlist: never spread original descriptions or unknown upstream fields.
  return {
    source: job.source,
    sourceJobId: job.sourceJobId,
    company,
    title,
    location,
    remote: job.remote,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    url: job.url,
    tags,
    postedAt: job.postedAt,
    descriptionText,
    jobId: `${job.source}:${role}:${job.sourceJobId}`,
    jobText: descriptionText,
    snapshotCapturedAt,
  };
}
