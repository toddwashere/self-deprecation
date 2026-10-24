import { and, desc, eq, gte, max, or, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { fetchRuns, newsItems } from "../../db/schema";
import type { NormalizedNews } from "../../sources/types";
import { canonicalNewsUrl, NEWS_FEEDS, plainNewsText } from "./adapters";

export async function upsertNews(db: DB, items: NormalizedNews[], now: number): Promise<number> {
  let count = 0;
  for (const item of items) {
    const url = canonicalNewsUrl(item.url);
    if (!url || !plainNewsText(item.title)) continue;
    const snippet = item.snippet ? plainNewsText(item.snippet).slice(0, 500) : null;
    await db
      .insert(newsItems)
      .values({
        id: `${item.source}:${url}`,
        source: item.source,
        title: plainNewsText(item.title).slice(0, 300),
        url,
        snippet: snippet,
        author: item.author,
        publishedAt: item.publishedAt,
        fetchedAt: now,
        tags: item.tags ?? [],
        score: item.score,
      })
      .onConflictDoUpdate({
        target: newsItems.url,
        set: {
          source: item.source,
          title: plainNewsText(item.title).slice(0, 300),
          snippet: snippet,
          author: item.author,
          publishedAt: item.publishedAt,
          fetchedAt: now,
          tags: item.tags ?? [],
          score: item.score,
        },
      });
    count += 1;
  }
  return count;
}

export interface NewsQuery {
  since?: number;
  limit: number;
  topics?: string[];
}

export async function readNewsCatalog(db: DB, query: NewsQuery, now: number) {
  const topicClauses = query.topics?.map(
    (topic) =>
      sql`exists (select 1 from json_each(${newsItems.tags}) where lower(value) = ${topic.toLowerCase()})`,
  );
  const items = await db
    .select()
    .from(newsItems)
    .where(
      and(
        query.since === undefined ? undefined : gte(newsItems.publishedAt, query.since),
        topicClauses?.length ? or(...topicClauses) : undefined,
      ),
    )
    .orderBy(
      desc(sql`coalesce(${newsItems.publishedAt}, ${newsItems.fetchedAt})`),
      desc(newsItems.id),
    )
    .limit(query.limit);
  const sources = await Promise.all(
    NEWS_FEEDS.map(async (feed) => {
      const condition = and(eq(fetchRuns.source, feed.id), eq(fetchRuns.kind, "news"));
      const [latest] = await db
        .select()
        .from(fetchRuns)
        .where(condition)
        .orderBy(desc(fetchRuns.startedAt), desc(fetchRuns.id))
        .limit(1);
      const [success] = await db
        .select({ at: max(fetchRuns.finishedAt) })
        .from(fetchRuns)
        .where(and(condition, eq(fetchRuns.status, "ok")));
      const status: "ok" | "error" | "running" | "partial" | "never" =
        latest?.status === "running" && now - latest.startedAt > 120_000
          ? "error"
          : latest?.status === "ok"
            ? "ok"
            : latest?.status === "error"
              ? "error"
              : latest?.status === "running"
                ? "running"
                : latest
                  ? "partial"
                  : "never";
      return {
        id: feed.id,
        label: feed.label,
        status,
        lastSuccessAt: success?.at ?? null,
        finishedAt: latest?.finishedAt ?? null,
      };
    }),
  );
  const [catalog] = await db.select({ at: max(newsItems.fetchedAt) }).from(newsItems);
  const timestamps = [catalog?.at, ...sources.map((source) => source.lastSuccessAt)].filter(
    (value): value is number => typeof value === "number",
  );
  return { items, sources, updatedAt: timestamps.length ? Math.max(...timestamps) : null };
}
