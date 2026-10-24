import type { NormalizedJob, SourceAdapter } from "../types";
import { jobJson } from "./job-http";
import { cleanDescription, jobTags, selectJobs } from "./normalization";

export interface HnComment {
  id: number | string;
  created_at_i?: number;
  text?: string | null;
  children?: HnComment[];
}

interface HnStoryHit {
  objectID: string;
  title?: string | null;
  created_at_i?: number;
}

interface HnSearchResponse {
  hits: HnStoryHit[];
}

interface HnThread {
  id: number | string;
  title?: string | null;
  created_at_i?: number;
  children?: HnComment[];
}

export interface HnAdapterOptions {
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

function fields(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const heading = first.match(/^seeking\s+(?:freelancer|work)\b\s*:?\s*(?:\|\s*)?/i);
  const inlineMetadata = heading ? first.slice(heading[0].length).trim() : "";
  const metadata = heading ? inlineMetadata || (lines[1] ?? "") : first;
  return metadata
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksLikeLocation(value: string) {
  return /\b(remote|onsite|hybrid|worldwide|anywhere|us|usa|uk|eu|canada|nyc|city)\b/i.test(value);
}

function looksLikeRole(value: string) {
  return /\b(engineer|developer|designer|manager|architect|scientist|analyst|consultant|lead|writer|marketer|sales|product|devops|sre|cto|technical)\b/i.test(
    value,
  );
}

function contractText(value: string) {
  const withoutNegation = value.replace(/\b(?:not|no)\s+(?:a\s+)?contract\b/gi, "");
  return /\b(contract(?:or)?|freelance(?:r)?|consult(?:ant|ing)|fractional|temporary)\b/i.test(
    withoutNegation,
  );
}

function cleanHnText(value: string) {
  return cleanDescription(value.replace(/<\s*(?:br|p|div)\b[^>]*>/gi, "\n"));
}

export function parseHnComment(
  comment: HnComment,
  source: "hn_hiring" | "hn_freelance",
): NormalizedJob | undefined {
  const descriptionText = cleanHnText(comment.text ?? "");
  if (!descriptionText) return undefined;
  const parts = fields(descriptionText);
  if (!parts.length) return undefined;
  const company = parts[0]?.replace(/^seeking\s+freelancer\s*:?\s*/i, "").trim();
  if (!company) return undefined;
  const title = parts.slice(1).find(looksLikeRole) ?? "Contract opportunity";
  const location = parts.slice(1).find(looksLikeLocation);
  const remote = /\bremote\b/i.test(`${location ?? ""} ${descriptionText}`) || undefined;
  const postedAt = Number.isFinite(comment.created_at_i)
    ? Number(comment.created_at_i) * 1_000
    : undefined;
  return {
    source,
    sourceJobId: String(comment.id),
    company,
    title,
    location,
    remote,
    employmentType: "contract",
    url: `https://news.ycombinator.com/item?id=${encodeURIComponent(String(comment.id))}`,
    descriptionText,
    tags: jobTags(title, descriptionText, ["contract"]),
    postedAt,
  };
}

export function createHnContractAdapter(config: {
  id: "hn_hiring" | "hn_freelance";
  query: string;
  tags: "story" | "story,author_whoishiring";
  title: RegExp;
  include: (text: string) => boolean;
  options?: HnAdapterOptions;
}): SourceAdapter<NormalizedJob> {
  return {
    id: config.id,
    kind: "jobs",
    async fetch(_env, opts) {
      const searchUrl = new URL("https://hn.algolia.com/api/v1/search_by_date");
      searchUrl.searchParams.set("query", config.query);
      searchUrl.searchParams.set("tags", config.tags);
      searchUrl.searchParams.set("hitsPerPage", "20");
      const request = {
        fetcher: config.options?.fetcher,
        timeoutMs: config.options?.timeoutMs ?? 5_000,
      };
      const search = await jobJson<HnSearchResponse>(searchUrl, request);
      if (!search || !Array.isArray(search.hits)) throw new Error("Invalid HN search response");
      const story = search.hits.find(
        (hit) => hit.objectID && config.title.test(hit.title?.trim() ?? ""),
      );
      if (!story) return [];
      const thread = await jobJson<HnThread>(
        new URL(`https://hn.algolia.com/api/v1/items/${encodeURIComponent(story.objectID)}`),
        request,
      );
      if (!thread || !Array.isArray(thread.children)) throw new Error("Invalid HN thread response");
      const jobs = thread.children.flatMap((comment) => {
        const text = cleanHnText(comment.text ?? "");
        if (!config.include(text)) return [];
        const job = parseHnComment(comment, config.id);
        return job ? [job] : [];
      });
      return selectJobs(jobs, opts);
    },
  };
}

export const includesContractWork = contractText;
