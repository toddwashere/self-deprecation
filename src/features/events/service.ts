import { fetchWithTimeout } from "../../lib/http";

const EVENT_HOSTS = [
  "lu.ma",
  "luma.com",
  "www.meetup.com",
  "meetup.com",
  "www.eventbrite.com",
  "eventbrite.com",
] as const;
export const METADATA_TIMEOUT_MS = 1_500;

function plainText(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (original, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? original;
      const code =
        entity[1]?.toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function eventMetadata(
  url: string,
): Promise<{ title?: string; status: "enriched" | "unavailable" }> {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.port ||
    target.username ||
    target.password ||
    !EVENT_HOSTS.includes(target.hostname as (typeof EVENT_HOSTS)[number])
  )
    return { status: "unavailable" };
  try {
    const response = await fetchWithTimeout(target, {
      allowedHosts: EVENT_HOSTS,
      timeoutMs: METADATA_TIMEOUT_MS,
      maxBytes: 256_000,
      redirect: "manual",
      headers: { accept: "text/html" },
    });
    if (
      (response.status >= 300 && response.status < 400) ||
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    )
      return { status: "unavailable" };
    const html = await response.text();
    let ogTitle: string | undefined;
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const attributes: Record<string, string> = {};
      for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attributes[match[1].toLowerCase()] = match[2] ?? match[3];
      }
      if (attributes.property?.toLowerCase() === "og:title") {
        ogTitle = attributes.content;
        break;
      }
    }
    const title = plainText(ogTitle ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    return title ? { title, status: "enriched" } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
