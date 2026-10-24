import type { NormalizedJob, SourceAdapter } from "../types";
import { jobJson } from "./job-http";
import {
  cleanDescription,
  jobTags,
  normalizeEmployment,
  selectJobs,
  timestamp,
} from "./normalization";

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  job_type?: string;
  description?: string;
  tags?: string[];
  publication_date?: string;
  url: string;
}

// The source delays listings by 24 hours. Preserve Remotive attribution and URL.
export const remotiveAdapter: SourceAdapter<NormalizedJob> = {
  id: "remotive",
  kind: "jobs",
  async fetch(_env, opts) {
    const payload = await jobJson<{ jobs: RemotiveJob[] }>(
      new URL("https://remotive.com/api/remote-jobs?category=software-dev"),
    );
    if (!payload || !Array.isArray(payload.jobs)) throw new Error("Invalid Remotive response");
    return selectJobs(
      payload.jobs
        .filter((job) => job.id && job.title && job.company_name && job.url)
        .map((job) => {
          const descriptionText = cleanDescription(job.description ?? "");
          return {
            source: "remotive",
            sourceJobId: String(job.id),
            company: job.company_name,
            title: job.title,
            location: job.candidate_required_location || "Worldwide",
            remote: true,
            employmentType: normalizeEmployment(job.job_type),
            url: job.url,
            descriptionText,
            tags: jobTags(job.title, descriptionText, job.tags),
            postedAt: timestamp(
              job.publication_date ? `${job.publication_date.replace(/Z$/, "")}Z` : undefined,
            ),
          };
        }),
      opts,
    );
  },
};
