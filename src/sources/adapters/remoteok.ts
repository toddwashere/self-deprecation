import type { NormalizedJob, SourceAdapter } from "../types";
import { jobJson } from "./job-http";
import {
  cleanDescription,
  jobTags,
  normalizeEmployment,
  selectJobs,
  timestamp,
} from "./normalization";

interface RemoteOkJob {
  id?: string | number;
  company?: string;
  position?: string;
  tags?: string[];
  location?: string;
  description?: string;
  url?: string;
  epoch?: number;
  salary_min?: number;
  salary_max?: number;
}

// Keep Remote OK source attribution and its own listing URL (API terms).
export const remoteOkAdapter: SourceAdapter<NormalizedJob> = {
  id: "remoteok",
  kind: "jobs",
  async fetch(_env, opts) {
    const payload = await jobJson<RemoteOkJob[]>(new URL("https://remoteok.com/api"));
    if (!Array.isArray(payload)) throw new Error("Invalid Remote OK response");
    return selectJobs(
      payload
        .filter((job) => job.id && job.position && job.company && job.url)
        .map((job) => {
          const descriptionText = cleanDescription(job.description ?? "");
          return {
            source: "remoteok",
            sourceJobId: String(job.id),
            company: job.company ?? "",
            title: job.position ?? "",
            location: job.location || "Worldwide",
            remote: true,
            employmentType: normalizeEmployment(job.position),
            url: job.url ?? "",
            descriptionText,
            tags: jobTags(job.position ?? "", descriptionText, job.tags),
            postedAt: timestamp(job.epoch ? job.epoch * 1_000 : undefined),
            salaryMin: job.salary_min && job.salary_min > 0 ? job.salary_min : undefined,
            salaryMax: job.salary_max && job.salary_max > 0 ? job.salary_max : undefined,
            currency: job.salary_min || job.salary_max ? "USD" : undefined,
          };
        }),
      opts,
    );
  },
};
