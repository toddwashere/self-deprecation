import { describe, expect, it } from "vitest";
import { type CreateAgentSession, runDossierAgent } from "./agent";

const researchedAt = 1_798_128_000_000;
const dossier = {
  company: "Example Labs",
  website: "https://example.com",
  summary: "Example Labs builds developer infrastructure.",
  recentNews: [
    {
      title: "Example Labs ships a new platform",
      url: "https://example.com/news/platform",
      publishedAt: "2026-10-20",
      summary: "The company announced a new developer platform.",
    },
  ],
  engineeringSignals: [
    {
      signal: "TypeScript appears in public engineering material.",
      evidence: "The engineering blog includes TypeScript examples.",
      sourceUrl: "https://example.com/engineering/typescript",
    },
  ],
  roleTypes: [{ role: "Engineering manager", why: "Can explain the team charter." }],
  sources: [{ title: "Example Labs", url: "https://example.com" }],
  researchedAt,
};

describe("Agents API dossier boundary", () => {
  it("requests bounded structured research with live web search", async () => {
    let body: Record<string, unknown> | undefined;
    let signal: AbortSignal | undefined;
    const create: CreateAgentSession = async (request, options) => {
      body = request as unknown as Record<string, unknown>;
      signal = options.signal;
      return {
        controller: { abort() {} },
        finalResult: async () => ({ output_parsed: dossier }),
      };
    };

    const result = await runDossierAgent(
      "test-key",
      { company: "Example Labs", website: "https://example.com" },
      { create, timeoutMs: 100, now: () => new Date(researchedAt) },
    );

    expect(result).toEqual(dossier);
    expect(body).toMatchObject({
      environment: { type: "none" },
      spend_control: { limit: 10 },
      stream: true,
      agent: {
        model: "gpt-6-astra",
        reasoning: { effort: "low" },
        tools: [{ type: "web_search", mode: "live", context_size: "low" }],
        text: { format: { type: "json_schema" } },
      },
    });
    expect(body?.input).toContain("Example Labs");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("aborts local waiting at the configured deadline", async () => {
    const create: CreateAgentSession = async (_request, options) => ({
      controller: { abort() {} },
      finalResult: () =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    });

    await expect(
      runDossierAgent("test-key", { company: "Slow Corp" }, { create, timeoutMs: 5 }),
    ).rejects.toBeDefined();
  });
});
