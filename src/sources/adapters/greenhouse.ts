import type { Env } from "../../env";
import { fetchWithTimeout } from "../../lib/http";
import { extractSkills } from "../../lib/skills-dict";
import type { NormalizedJob, SourceAdapter } from "../types";

interface GreenhouseJob {
  id: number | string;
  title: string;
  updated_at?: string;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface GreenhouseOptions {
  id: string;
  boardToken: string;
  company: string;
  includeContent?: boolean;
  fetcher?: Fetcher;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function htmlToText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, 8_000);
}

function employmentType(title: string): NormalizedJob["employmentType"] {
  const normalized = title.toLowerCase();
  if (/contract|contractor|freelance/.test(normalized)) return "contract";
  if (/part[ -]?time/.test(normalized)) return "part_time";
  return "full_time";
}

export function createGreenhouseAdapter(options: GreenhouseOptions): SourceAdapter<NormalizedJob> {
  return {
    id: options.id,
    kind: "jobs",
    async fetch(_env: Env, opts) {
      const url = new URL(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(options.boardToken)}/jobs`,
      );
      if (options.includeContent) url.searchParams.set("content", "true");
      const response = options.fetcher
        ? await options.fetcher(url)
        : await fetchWithTimeout(url, {
            allowedHosts: ["boards-api.greenhouse.io"],
            timeoutMs: 8_000,
            maxBytes: 1_000_000,
          });
      if (!response.ok) throw new Error(`Greenhouse request failed (${response.status})`);
      const payload = (await response.json()) as GreenhouseResponse;
      const limit = Math.max(0, opts.limit ?? 100);
      return (payload.jobs ?? []).slice(0, limit).map((job) => {
        const location = job.location?.name?.trim() || undefined;
        const descriptionText = job.content ? htmlToText(job.content) : undefined;
        const skillText = `${job.title} ${descriptionText ?? ""}`;
        return {
          source: options.id,
          sourceJobId: String(job.id),
          company: options.company,
          title: job.title.trim(),
          location,
          remote: location ? /\bremote\b/i.test(location) : undefined,
          employmentType: employmentType(job.title),
          url: job.absolute_url,
          descriptionText,
          tags: extractSkills(skillText),
          postedAt: job.updated_at ? Date.parse(job.updated_at) || undefined : undefined,
        };
      });
    },
  };
}

export const anthropicGreenhouseAdapter = createGreenhouseAdapter({
  id: "greenhouse_anthropic",
  boardToken: "anthropic",
  company: "Anthropic",
});
