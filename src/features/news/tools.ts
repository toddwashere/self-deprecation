import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { readNewsCatalog } from "./repo";

export const newsInput = {
  since: z
    .number()
    .int()
    .nonnegative()
    .max(8640000000000000)
    .optional()
    .describe(
      "Inclusive publication time, Unix epoch milliseconds. Unknown publication dates are excluded when set.",
    ),
  limit: z.number().int().min(1).max(50).optional(),
  topics: z
    .array(z.string().trim().min(1).max(60))
    .max(10)
    .optional()
    .describe("Match any exact topic tag, case insensitive; omit for all topics."),
};
const inputSchema = z.strictObject(newsInput);
export const newsOutputSchema = z.object({
  tab: z.literal("news"),
  items: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      title: z.string(),
      url: z.url(),
      snippet: z.string().max(500).nullable(),
      author: z.string().nullable(),
      publishedAt: z.number().nullable(),
      fetchedAt: z.number(),
      tags: z.array(z.string()),
      score: z.number().nullable(),
      ageHours: z.number().nonnegative().nullable(),
    }),
  ),
  updatedAt: z.number().nullable(),
  stale: z.boolean(),
  sources: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(["ok", "error", "running", "partial", "never"]),
      lastSuccessAt: z.number().nullable(),
      finishedAt: z.number().nullable(),
    }),
  ),
  progress: z.object({
    stage: z.enum(["fetching", "done"]),
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
export type NewsOutput = z.infer<typeof newsOutputSchema>;
export const newsTools: ToolDef[] = [
  {
    name: "get_ai_news",
    title: "Get AI news",
    description:
      "Use this to read stored public AI headlines, source links, publication dates, topic tags, freshness and source health, including a weekly digest. Do not use it for live web search, full article text, or personal data. Next, summarize selected headlines with links, distinguish publisher claims from established facts, and show when stored coverage is stale. Feed refresh runs on the daily cron; this tool only reads stored results.",
    input: newsInput,
    output: newsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: { invoking: "Reading the industry changelog…", invoked: "News ready. Keep learning." },
    opensPanel: true,
    handler: async (args, ctx) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success)
        return fail(
          "INVALID_INPUT",
          "Use epoch milliseconds for since, 1–50 items, and up to 10 nonempty topic tags.",
        );
      try {
        const now = ctx.now().getTime();
        const catalog = await readNewsCatalog(ctx.db, {
          ...parsed.data,
          limit: parsed.data.limit ?? 20,
        });
        const running = catalog.sources.filter((source) => source.status === "running").length;
        const result: NewsOutput = {
          tab: "news",
          ...catalog,
          items: catalog.items.map((item) => ({
            ...item,
            ageHours:
              item.publishedAt === null ? null : Math.max(0, (now - item.publishedAt) / 3600000),
          })),
          stale: catalog.updatedAt === null || now - catalog.updatedAt > 36 * 3600000,
          progress: {
            stage: running ? "fetching" : "done",
            done: catalog.sources.length - running,
            total: catalog.sources.length,
          },
        };
        return ok(
          `${result.items.length} stored AI headlines. ${result.stale ? "Coverage may be stale." : "Coverage recently updated."} Use the article links and publication dates when summarizing.`,
          result,
        );
      } catch {
        return fail("INTERNAL", "The news catalog could not be read.", "Try again shortly.");
      }
    },
  },
];
