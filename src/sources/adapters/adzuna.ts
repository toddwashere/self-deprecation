import type { NormalizedJob, SourceAdapter } from "../types";
import { jobJson } from "./job-http";
import {
  cleanDescription,
  jobTags,
  normalizeEmployment,
  selectJobs,
  timestamp,
} from "./normalization";

interface AdzunaJob {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  description?: string;
  created?: string;
  contract_time?: string;
  contract_type?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
}

export function createAdzunaAdapter(options: {
  query: string;
  location: string;
  timeoutMs?: number;
}): SourceAdapter<NormalizedJob> {
  return {
    id: "adzuna",
    kind: "jobs",
    async fetch(env, opts) {
      if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY)
        throw new Error("Adzuna credentials are not configured");
      const url = new URL("https://api.adzuna.com/v1/api/jobs/us/search/1");
      url.searchParams.set("app_id", env.ADZUNA_APP_ID);
      url.searchParams.set("app_key", env.ADZUNA_APP_KEY);
      url.searchParams.set("what", options.query.trim().slice(0, 100));
      url.searchParams.set("where", options.location.trim().slice(0, 100));
      url.searchParams.set("results_per_page", String(Math.max(1, Math.min(opts.limit ?? 50, 50))));
      url.searchParams.set("content-type", "application/json");
      const payload = await jobJson<{ results: AdzunaJob[] }>(url, {
        timeoutMs: options.timeoutMs,
      });
      if (!payload || !Array.isArray(payload.results)) throw new Error("Invalid Adzuna response");
      return selectJobs(
        payload.results
          .filter((job) => job.id && job.title && job.redirect_url)
          .map((job) => {
            const descriptionText = cleanDescription(job.description ?? "");
            const disclosed = String(job.salary_is_predicted) === "0";
            return {
              source: "adzuna",
              sourceJobId: job.id,
              company: job.company?.display_name ?? "Company not listed",
              title: cleanDescription(job.title),
              location: job.location?.display_name,
              remote:
                /\bremote\b/i.test(`${job.title} ${job.location?.display_name ?? ""}`) || undefined,
              employmentType: normalizeEmployment(
                job.contract_type === "contract" ? "contract" : job.contract_time,
              ),
              url: job.redirect_url,
              descriptionText,
              tags: jobTags(job.title, descriptionText),
              postedAt: timestamp(job.created),
              salaryMin: disclosed ? job.salary_min : undefined,
              salaryMax: disclosed ? job.salary_max : undefined,
              currency: disclosed && (job.salary_min || job.salary_max) ? "USD" : undefined,
            };
          }),
        opts,
      );
    },
  };
}

// Adzuna must be invoked through the criteria-aware service; no global default search.
export const adzunaAdapter: SourceAdapter<NormalizedJob> = {
  id: "adzuna",
  kind: "jobs",
  async fetch() {
    return [];
  },
};
