import type { Env } from "../env";

export interface NormalizedJob {
  source: string;
  sourceJobId: string;
  company: string;
  title: string;
  location?: string;
  remote?: boolean;
  employmentType: "full_time" | "contract" | "part_time" | "unknown";
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  url: string;
  descriptionText?: string;
  tags?: string[];
  postedAt?: number;
}

export interface NormalizedNews {
  source: string;
  title: string;
  url: string;
  snippet?: string;
  author?: string;
  publishedAt?: number;
  tags?: string[];
  score?: number;
}

export interface SourceAdapter<T> {
  id: string;
  kind: "jobs" | "news";
  fetch(env: Env, opts: { since?: number; limit?: number }): Promise<T[]>;
}

export type AnySourceAdapter = SourceAdapter<NormalizedJob> | SourceAdapter<NormalizedNews>;
