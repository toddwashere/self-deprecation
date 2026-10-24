import type { NormalizedJob, SourceAdapter } from "../types";
import { type HnAdapterOptions, parseHnComment } from "./hn_common";
import { jobJson } from "./job-http";
import { cleanDescription, selectJobs } from "./normalization";

interface HnCommentHit {
  objectID: string;
  created_at_i?: number;
  comment_text?: string | null;
}

export function createHnFreelanceAdapter(
  options: HnAdapterOptions = {},
): SourceAdapter<NormalizedJob> {
  return {
    id: "hn_freelance",
    kind: "jobs",
    async fetch(_env, opts) {
      const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
      url.searchParams.set("query", "SEEKING FREELANCER");
      url.searchParams.set("tags", "comment");
      url.searchParams.set("hitsPerPage", "100");
      const payload = await jobJson<{ hits: HnCommentHit[] }>(url, {
        fetcher: options.fetcher,
        timeoutMs: options.timeoutMs ?? 5_000,
      });
      if (!payload || !Array.isArray(payload.hits))
        throw new Error("Invalid HN freelancer response");
      const jobs = payload.hits.flatMap((hit) => {
        const text = cleanDescription(hit.comment_text ?? "");
        if (!/^SEEKING FREELANCER\b/i.test(text)) return [];
        const job = parseHnComment(
          { id: hit.objectID, created_at_i: hit.created_at_i, text: hit.comment_text },
          "hn_freelance",
        );
        return job ? [job] : [];
      });
      return selectJobs(jobs, opts);
    },
  };
}

export const hnFreelanceAdapter = createHnFreelanceAdapter();
