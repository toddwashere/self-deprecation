import { describe, expect, it } from "vitest";
import { type AgentSessionClient, pollDossierAgent, startDossierAgent } from "./agent";

const researchedAt = 1_798_128_000_000;
const dossier = {
  company: "Example Labs",
  website: "https://example.com",
  summary: "Example Labs builds developer infrastructure.",
  recentNews: [],
  engineeringSignals: [],
  roleTypes: [{ role: "Engineering manager", why: "Can explain the team charter." }],
  sources: [{ title: "Example Labs", url: "https://example.com" }],
  researchedAt,
};

describe("Agents API dossier boundary", () => {
  it("starts bounded structured live-web research asynchronously", async () => {
    let request: Record<string, unknown> | undefined;
    const client: AgentSessionClient = {
      start: async (body) => {
        request = body as unknown as Record<string, unknown>;
        return { id: "session-1", status: "in_progress" };
      },
      retrieve: async () => ({ status: "in_progress" }),
      turns: async () => [],
      items: async () => [],
    };

    await expect(
      startDossierAgent(
        "test-key",
        { company: "Example Labs", website: "https://example.com" },
        { client, timeoutMs: 100, now: () => new Date(researchedAt) },
      ),
    ).resolves.toEqual({ sessionId: "session-1", status: "in_progress" });
    expect(request).toMatchObject({
      environment: { type: "none" },
      spend_control: { limit: 10 },
      stream: false,
      agent: {
        model: "gpt-6-luna",
        reasoning: { effort: "low" },
        tools: [{ type: "web_search", mode: "live", context_size: "low" }],
        text: { format: { type: "json_schema" } },
      },
    });
    expect(request?.input).toContain("Example Labs");
    expect(JSON.stringify(request)).not.toContain('"format":"uri"');
  });

  it("fails closed when the live beta rejects spend control", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const client: AgentSessionClient = {
      start: async (request) => {
        requests.push(request as unknown as Record<string, unknown>);
        const error = new Error("400 Unknown parameter: 'spend_control'.") as Error & {
          status: number;
          param: string;
        };
        error.status = 400;
        error.param = "spend_control";
        throw error;
      },
      retrieve: async () => ({ status: "in_progress" }),
      turns: async () => [],
      items: async () => [],
    };

    await expect(
      startDossierAgent("test-key", { company: "Example Labs" }, { client, timeoutMs: 100 }),
    ).rejects.toThrow("server-enforced spend limit");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toHaveProperty("spend_control");
  });

  it("polls without blocking and parses completed structured output", async () => {
    const client: AgentSessionClient = {
      start: async () => ({ id: "unused", status: "in_progress" }),
      retrieve: async () => ({ status: "idle" }),
      turns: async () => [
        {
          id: "turn-1",
          sessionId: "session-1",
          status: "completed",
          subagentId: null,
        },
      ],
      items: async () => [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          phase: "final_answer",
          turnId: "turn-1",
          content: [{ type: "output_text", text: JSON.stringify(dossier) }],
        },
      ],
    };

    await expect(
      pollDossierAgent(
        "test-key",
        "session-1",
        { company: "Example Labs", website: "https://example.com", researchedAt },
        { client, timeoutMs: 100 },
      ),
    ).resolves.toEqual({ status: "complete", dossier });
  });

  it("returns researching without listing items while the session is active", async () => {
    let listed = false;
    const client: AgentSessionClient = {
      start: async () => ({ id: "unused", status: "in_progress" }),
      retrieve: async () => ({ status: "in_progress" }),
      turns: async () => [],
      items: async () => {
        listed = true;
        return [];
      },
    };

    await expect(
      pollDossierAgent(
        "test-key",
        "session-1",
        { company: "Example Labs", researchedAt },
        { client, timeoutMs: 100 },
      ),
    ).resolves.toEqual({ status: "researching" });
    expect(listed).toBe(false);
  });

  it("rejects output unless the relevant root turn completed successfully", async () => {
    const client: AgentSessionClient = {
      start: async () => ({ id: "unused", status: "in_progress" }),
      retrieve: async () => ({ status: "idle" }),
      turns: async () => [
        {
          id: "turn-current",
          sessionId: "session-1",
          status: "failed",
          subagentId: null,
        },
      ],
      items: async () => [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          phase: "final_answer",
          turnId: "turn-stale",
          content: [{ type: "output_text", text: JSON.stringify(dossier) }],
        },
      ],
    };

    await expect(
      pollDossierAgent(
        "test-key",
        "session-1",
        { company: "Example Labs", researchedAt },
        { client, timeoutMs: 100 },
      ),
    ).rejects.toThrow("did not complete successfully");
  });
});
