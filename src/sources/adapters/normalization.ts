import { extractSkills } from "../../lib/skills-dict";
import type { NormalizedJob } from "../types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  ndash: "–",
  mdash: "—",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return ENTITIES[entity.toLowerCase()] ?? match;
    const value = entity.slice(1).toLowerCase();
    const point = value.startsWith("x") ? Number.parseInt(value.slice(1), 16) : Number(value);
    return Number.isInteger(point) &&
      point >= 0 &&
      point <= 0x10ffff &&
      !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point)
      : "�";
  });
}

export function cleanDescription(value: string): string {
  const text = decodeEntities(decodeEntities(value.slice(0, 200_000)))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>|<\/\s*(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n\s*/g, "\n")
    .trim();
  let size = 0;
  let result = "";
  for (const point of text) {
    const code = point.codePointAt(0) ?? 0;
    size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : point.length === 2 ? 4 : 3;
    if (size > 8_000) break;
    result += point;
  }
  return result;
}

export function normalizeEmployment(value?: string): NormalizedJob["employmentType"] {
  if (/contract|freelance|temporary/i.test(value ?? "")) return "contract";
  if (/part[ _-]?time/i.test(value ?? "")) return "part_time";
  if (/full[ _-]?time/i.test(value ?? "")) return "full_time";
  return "unknown";
}

export function selectJobs(
  items: NormalizedJob[],
  opts: { since?: number; limit?: number },
): NormalizedJob[] {
  return items
    .filter(
      (job) => opts.since === undefined || job.postedAt === undefined || job.postedAt >= opts.since,
    )
    .slice(0, Math.max(0, Math.min(opts.limit ?? 100, 1_000)));
}

export function jobTags(title: string, text: string, tags: string[] = []): string[] {
  return [
    ...new Set([
      ...extractSkills(`${title} ${text}`),
      ...tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    ]),
  ].slice(0, 40);
}

export function timestamp(value?: string | number): number | undefined {
  const date = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(date) ? date : undefined;
}
