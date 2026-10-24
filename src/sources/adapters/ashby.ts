import type { NormalizedJob, SourceAdapter } from "../types";
import { type BoardOptions, jobJson } from "./job-http";
import {
  cleanDescription,
  jobTags,
  normalizeEmployment,
  selectJobs,
  timestamp,
} from "./normalization";

interface AshbyJob {
  id?: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  jobUrl: string;
  compensation?: {
    summaryComponents?: {
      compensationType?: string;
      interval?: string;
      currencyCode?: string;
      minValue?: number;
      maxValue?: number;
    }[];
  };
}

export function createAshbyAdapter(options: BoardOptions): SourceAdapter<NormalizedJob> {
  return {
    id: options.id,
    kind: "jobs",
    async fetch(_env, opts) {
      const url = new URL(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(options.boardToken)}?includeCompensation=true`,
      );
      const payload = await jobJson<{ jobs: AshbyJob[] }>(url, options, true);
      if (payload === null) return [];
      if (!Array.isArray(payload.jobs)) throw new Error("Invalid Ashby response");
      const candidates = payload.jobs
        .filter((job) => job.isListed !== false && job.title && job.jobUrl)
        .filter(
          (job) =>
            opts.since === undefined ||
            !timestamp(job.publishedAt) ||
            (timestamp(job.publishedAt) ?? 0) >= opts.since,
        )
        .slice(0, Math.max(0, Math.min(opts.limit ?? 100, 1_000)));
      return selectJobs(
        candidates.map((job) => {
          const descriptionText = cleanDescription(
            job.descriptionPlain ?? job.descriptionHtml ?? "",
          );
          const location =
            [job.location, ...(job.secondaryLocations ?? []).map((place) => place.location)]
              .filter(Boolean)
              .join("; ") || undefined;
          const salary = job.compensation?.summaryComponents?.find(
            (component) =>
              component.compensationType === "Salary" && component.interval === "1 YEAR",
          );
          return {
            source: options.id,
            sourceJobId: job.id ?? job.jobUrl,
            company: options.company,
            title: job.title.trim(),
            location: job.workplaceType === "Hybrid" ? `${location ?? ""} (Hybrid)` : location,
            remote: job.workplaceType ? job.workplaceType === "Remote" : job.isRemote,
            employmentType: normalizeEmployment(job.employmentType),
            url: job.jobUrl,
            descriptionText,
            tags: jobTags(job.title, descriptionText),
            postedAt: timestamp(job.publishedAt),
            salaryMin: salary?.minValue,
            salaryMax: salary?.maxValue,
            currency: salary?.currencyCode,
          };
        }),
        opts,
      );
    },
  };
}

export const ashbyAdapter = createAshbyAdapter({
  id: "ashby",
  boardToken: "linear",
  company: "Linear",
});
