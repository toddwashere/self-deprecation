import type { NormalizedJob, NormalizedNews, SourceAdapter } from "../types";

export function emptyJobSource(id: string): SourceAdapter<NormalizedJob> {
  return { id, kind: "jobs", fetch: async () => [] };
}

export function emptyNewsSource(id: string): SourceAdapter<NormalizedNews> {
  return { id, kind: "news", fetch: async () => [] };
}
