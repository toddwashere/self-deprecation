import type { NormalizedJob, SourceAdapter } from "../types";
import { type BoardOptions, jobJson } from "./job-http";
import {
  cleanDescription,
  jobTags,
  normalizeEmployment,
  selectJobs,
  timestamp,
} from "./normalization";

interface LeverJob {
  id: string;
  text: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  workplaceType?: string;
  descriptionPlain?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
  hostedUrl: string;
  createdAt?: number;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export function createLeverAdapter(options: BoardOptions): SourceAdapter<NormalizedJob> {
  return {
    id: options.id,
    kind: "jobs",
    async fetch(_env, opts) {
      const url = new URL(
        `https://api.lever.co/v0/postings/${encodeURIComponent(options.boardToken)}?mode=json`,
      );
      const payload = await jobJson<LeverJob[]>(url, options, true);
      if (payload === null) return [];
      if (!Array.isArray(payload)) throw new Error("Invalid Lever response");
      return selectJobs(
        payload
          .filter((job) => job.id && job.text && job.hostedUrl)
          .map((job) => {
            const descriptionText = cleanDescription(
              [
                job.descriptionPlain ?? job.description ?? "",
                ...(job.lists ?? []).map(
                  (section) => `${section.text ?? ""}\n${section.content ?? ""}`,
                ),
                job.additionalPlain ?? "",
              ].join("\n"),
            );
            const workplace = job.workplaceType?.toLowerCase();
            const baseLocation =
              job.categories?.allLocations?.join("; ") || job.categories?.location;
            const salary = /year|annum/i.test(job.salaryRange?.interval ?? "")
              ? job.salaryRange
              : undefined;
            return {
              source: options.id,
              sourceJobId: job.id,
              company: options.company,
              title: job.text.trim(),
              location: workplace === "hybrid" ? `${baseLocation ?? ""} (Hybrid)` : baseLocation,
              remote: workplace
                ? workplace === "remote"
                : baseLocation
                  ? /\bremote\b/i.test(baseLocation)
                  : undefined,
              employmentType: normalizeEmployment(job.categories?.commitment),
              url: job.hostedUrl,
              descriptionText,
              tags: jobTags(job.text, descriptionText),
              postedAt: timestamp(job.createdAt),
              salaryMin: salary?.min,
              salaryMax: salary?.max,
              currency: salary?.currency,
            };
          }),
        opts,
      );
    },
  };
}

export const leverAdapter = createLeverAdapter({
  id: "lever",
  boardToken: "wealthfront",
  company: "Wealthfront",
});
