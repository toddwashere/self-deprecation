import { fetchWithTimeout } from "../../lib/http";
import { extractSkills } from "../../lib/skills-dict";
import type { NormalizedNews, SourceAdapter } from "../../sources/types";

export const NEWS_FEEDS = [
  { id: "openai_news", label: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { id: "hf_blog", label: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { id: "deepmind_blog", label: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  {
    id: "simon_willison",
    label: "Simon Willison",
    url: "https://simonwillison.net/atom/everything/",
  },
] as const;

function decode(text: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (original, entity: string) => {
      if (entity.startsWith("#")) {
        const n =
          entity[1].toLowerCase() === "x"
            ? Number.parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
          ? String.fromCodePoint(n)
          : "";
      }
      return entities[entity.toLowerCase()] ?? original;
    },
  );
}

export function plainNewsText(text: string): string {
  let plain = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let pass = 0; pass < 4; pass += 1) {
    const next = decode(plain)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]*>/g, " ");
    if (next === plain) break;
    plain = next;
  }
  return plain.replace(/\s+/g, " ").trim();
}

export function canonicalNewsUrl(raw: string): string | undefined {
  try {
    const url = new URL(decode(raw.trim()));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      return undefined;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function field(xml: string, name: string): string {
  return (
    xml.match(
      new RegExp(
        `<(?:(?:[\\w-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${name}\\s*>`,
        "i",
      ),
    )?.[1] ?? ""
  );
}

// Deliberately narrow RSS/Atom reader: no DTD/entity expansion or remote XML resources.
export function parseNewsFeed(
  xml: string,
  source: string,
  opts: { since?: number; limit?: number },
): NormalizedNews[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/<(?:[\w-]+:)?(?:rss|feed)\b/i.test(xml))
    throw new Error("Invalid news feed");
  const entries =
    xml.match(
      /<(?:(?:[\w-]+):)?(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:(?:[\w-]+):)?(?:item|entry)\s*>/gi,
    ) ?? [];
  const items: NormalizedNews[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const links = entry.match(/<(?:[\w-]+:)?link\b[^>]*\/?\s*>/gi) ?? [];
    const alternate =
      links.find((link) => /\brel\s*=\s*["']alternate["']/i.test(link)) ??
      links.find((link) => !/\brel\s*=/i.test(link));
    const href = alternate?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const url = canonicalNewsUrl(href ?? field(entry, "link"));
    const title = plainNewsText(field(entry, "title")).slice(0, 300);
    if (!url || !title || seen.has(url)) continue;
    const timestamp = Date.parse(
      plainNewsText(
        field(entry, "pubDate") || field(entry, "published") || field(entry, "updated"),
      ),
    );
    const publishedAt = Number.isFinite(timestamp) ? timestamp : undefined;
    if (opts.since !== undefined && (publishedAt === undefined || publishedAt < opts.since))
      continue;
    const snippet = plainNewsText(
      field(entry, "description") || field(entry, "summary") || field(entry, "content"),
    ).slice(0, 500);
    const author = plainNewsText(
      field(field(entry, "author"), "name") || field(entry, "creator") || field(entry, "author"),
    ).slice(0, 200);
    const categories = [
      ...entry.matchAll(/<(?:[\w-]+:)?category\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?category>/gi),
    ].map((match) => plainNewsText(match[1]).toLowerCase());
    const termCategories = [...entry.matchAll(/<(?:[\w-]+:)?category\b([^>]*)>/gi)]
      .map((match) => match[1].match(/(?:^|\s)term\s*=\s*["']([^"']*)["']/i)?.[1] ?? "")
      .map((term) => plainNewsText(term).toLowerCase());
    const tags = [
      ...new Set([...extractSkills(`${title} ${snippet}`), ...categories, ...termCategories]),
    ]
      .filter(Boolean)
      .slice(0, 15);
    seen.add(url);
    items.push({
      source,
      title,
      url,
      snippet: snippet || undefined,
      author: author || undefined,
      publishedAt,
      tags,
    });
  }
  if (entries.length > 0 && items.length === 0 && opts.since === undefined)
    throw new Error("News feed contained no usable entries");
  return items.slice(0, Math.min(50, Math.max(1, opts.limit ?? 20)));
}

export function newsFeedAdapter(id: string): SourceAdapter<NormalizedNews> {
  const feed = NEWS_FEEDS.find((feed) => feed.id === id);
  if (!feed) throw new Error("Unknown news feed");
  return {
    id,
    kind: "news",
    async fetch(_env, opts) {
      const response = await fetchWithTimeout(feed.url, {
        allowedHosts: [new URL(feed.url).hostname],
        redirect: "manual",
        timeoutMs: 6_000,
        maxBytes: 2_000_000,
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          "user-agent": "Self-Deprecation/0.1 (public news reader)",
        },
      });
      if (!response.ok) throw new Error(`News feed HTTP ${response.status}`);
      return parseNewsFeed(await response.text(), id, opts);
    },
  };
}
