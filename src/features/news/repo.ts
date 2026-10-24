import type { DB } from "../../db/client";
import { newsItems } from "../../db/schema";
import type { NormalizedNews } from "../../sources/types";

export async function upsertNews(db: DB, items: NormalizedNews[], now: number): Promise<number> {
  for (const item of items) {
    await db
      .insert(newsItems)
      .values({
        id: `${item.source}:${item.url}`,
        source: item.source,
        title: item.title,
        url: item.url,
        snippet: item.snippet?.slice(0, 500),
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
          title: item.title,
          snippet: item.snippet?.slice(0, 500),
          author: item.author,
          publishedAt: item.publishedAt,
          fetchedAt: now,
          tags: item.tags ?? [],
          score: item.score,
        },
      });
  }
  return items.length;
}
