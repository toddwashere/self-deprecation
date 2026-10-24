import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../env";
import { deepMindNewsAdapter } from "../../sources/adapters/news_deepmind";
import { huggingFaceNewsAdapter } from "../../sources/adapters/news_huggingface";
import { openAiNewsAdapter } from "../../sources/adapters/news_openai";
import { simonWillisonNewsAdapter } from "../../sources/adapters/news_simon";
import { recordedFeeds } from "./fixtures/feeds";

afterEach(() => vi.unstubAllGlobals());
const fixtures = [
  [
    openAiNewsAdapter,
    "openai",
    "Rapidly scaling online storage to serve over 1 billion ChatGPT users (Part II)",
    "https://openai.com/index/scaling-storage-one-billion-users-part-two",
  ],
  [
    huggingFaceNewsAdapter,
    "huggingface",
    "LitPivot: Developing research ideas through dynamic contextualization within the literature landscape",
    "https://huggingface.co/blog/allenai/litpivot",
  ],
  [
    deepMindNewsAdapter,
    "deepmind",
    "Beyond tree cover: mapping the world’s forest types",
    "https://deepmind.google/blog/beyond-tree-cover-mapping-the-worlds-forest-types/",
  ],
  [
    simonWillisonNewsAdapter,
    "simon",
    "battledrones v14: Compass Rose, a four player map",
    "https://simonwillison.net/2026/Oct/24/battledrones/",
  ],
] as const;

describe("public news normalization (T7)", () => {
  for (const [adapter, file, title, url] of fixtures) {
    it(`normalizes recorded ${adapter.id} feed entry`, async () => {
      const entry = recordedFeeds[file];
      vi.stubGlobal("fetch", async () => new Response(`<rss><channel>${entry}</channel></rss>`));
      const items = await adapter.fetch({} as Env, { limit: 20 });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ source: adapter.id, title, url });
      expect(items[0].publishedAt).toBeGreaterThan(1_790_000_000_000);
      expect(items[0].snippet?.length ?? 0).toBeLessThanOrEqual(500);
      expect(items[0].snippet ?? "").not.toMatch(/<[^>]*>/);
    });
  }
  it("strips HTML, truncates, deduplicates canonical URLs and rejects unsafe links", async () => {
    const item = (url: string, date = "Fri, 23 Oct 2026 17:00:00 GMT") =>
      `<item><title>AI &amp; Python</title><link>${url}</link><description><![CDATA[<p>${"text ".repeat(120)}</p><script>bad()</script>]]></description><pubDate>${date}</pubDate></item>`;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          `<rss><channel>${item("https://openai.com/story?utm_source=rss")}${item("https://openai.com/story")}${item("javascript:alert(1)")}${item("https://openai.com/old", "Mon, 01 Jan 2024 00:00:00 GMT")}</channel></rss>`,
        ),
    );
    const items = await openAiNewsAdapter.fetch({} as Env, { since: 1_790_000_000_000, limit: 20 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "AI & Python",
      url: "https://openai.com/story",
      tags: ["ai", "python"],
    });
    expect(items[0].snippet).toHaveLength(500);
    expect(items[0].snippet).not.toContain("bad()");
  });
  it("reports HTTP failures and malformed feeds instead of succeeding with no data", async () => {
    vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
    await expect(openAiNewsAdapter.fetch({} as Env, {})).rejects.toThrow();
    vi.stubGlobal("fetch", async () => new Response("<html>blocked</html>"));
    await expect(openAiNewsAdapter.fetch({} as Env, {})).rejects.toThrow();
  });
});
