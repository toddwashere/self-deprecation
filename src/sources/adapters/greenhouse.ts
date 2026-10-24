import type { NormalizedJob, SourceAdapter } from "../types";
import { type BoardOptions, jobJson } from "./job-http";
import {
  cleanDescription,
  jobTags,
  normalizeEmployment,
  selectJobs,
  timestamp,
} from "./normalization";

interface GreenhouseJob {
  id: number | string;
  title: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
}

export function createGreenhouseAdapter(
  options: BoardOptions & { includeContent?: boolean },
): SourceAdapter<NormalizedJob> {
  return {
    id: options.id,
    kind: "jobs",
    async fetch(_env, opts) {
      const url = new URL(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(options.boardToken)}/jobs`,
      );
      if (options.includeContent !== false) url.searchParams.set("content", "true");
      const payload = await jobJson<{ jobs: GreenhouseJob[] }>(url, options, true);
      if (payload === null) return [];
      if (!Array.isArray(payload.jobs)) throw new Error("Invalid Greenhouse response");
      const candidates = payload.jobs
        .filter((job) => job.id != null && job.title && job.absolute_url)
        .map((job) => ({
          job,
          postedAt: timestamp(job.first_published) ?? timestamp(job.updated_at),
        }))
        .filter(
          ({ postedAt }) =>
            opts.since === undefined || postedAt === undefined || postedAt >= opts.since,
        )
        .slice(0, Math.max(0, Math.min(opts.limit ?? 100, 1_000)));
      return selectJobs(
        candidates.map(({ job, postedAt }) => {
          const location = job.location?.name?.trim() || undefined;
          const descriptionText = cleanDescription(job.content ?? "");
          const employment = normalizeEmployment(job.title);
          return {
            source: options.id,
            sourceJobId: String(job.id),
            company: options.company,
            title: job.title.trim(),
            location,
            remote: location
              ? /\bremote\b/i.test(location) && !/\bhybrid\b/i.test(location)
              : undefined,
            employmentType: employment === "unknown" ? "full_time" : employment,
            url: job.absolute_url,
            descriptionText,
            tags: jobTags(job.title, descriptionText),
            postedAt,
          };
        }),
        opts,
      );
    },
  };
}

export const anthropicGreenhouseAdapter = createGreenhouseAdapter({
  id: "greenhouse_anthropic",
  boardToken: "anthropic",
  company: "Anthropic",
});
