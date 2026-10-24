import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../db/client";
import { apiUsage, notes, userState, users } from "../../db/schema";
import type { Env } from "../../env";
import type { ToolContext } from "../../mcp/types";
import type { CompanyDossier } from "./agent";
import { createDossierTools, dossierOutputSchema } from "./tools";

const bound = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(bound.DB);
const now = Date.UTC(2026, 9, 24, 12);
const dossier: CompanyDossier = {
  company: "Example Labs",
  website: "https://example.com",
  summary: "Developer infrastructure.",
  recentNews: [],
  engineeringSignals: [],
  roleTypes: [{ role: "Engineering manager", why: "Team context." }],
  sources: [{ title: "Example Labs", url: "https://example.com" }],
  researchedAt: now,
};

function context(overrides: Record<string, string> = {}): ToolContext {
  return {
    db,
    userId: "a",
    env: {
      ...bound,
      OPENAI_API_KEY: "test-key",
      AGENTS_ENABLED: "1",
      AGENTS_GLOBAL_DAILY_CAP: "100",
      ...overrides,
    } as Env,
    now: () => new Date(now),
    identity: { userId: "a", name: "A" },
    log: { info() {}, warn() {}, error() {} },
  };
}

beforeAll(async () => applyD1Migrations(bound.DB, bound.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(apiUsage);
  await db.delete(notes);
  await db.delete(userState);
  await db.delete(users);
  await db.insert(users).values({ id: "a", displayName: "A", createdAt: now, updatedAt: now });
});

describe("run_company_dossier", () => {
  it("starts research, then polls and saves a completed caller-owned dossier", async () => {
    const operations = {
      start: vi.fn(async () => ({ sessionId: "session-1", status: "in_progress" as const })),
      poll: vi.fn(async () => ({ status: "complete" as const, dossier })),
    };
    const tool = createDossierTools(operations)[0];
    const started = await tool.handler(
      { company: "Example Labs", website: "https://example.com" },
      context(),
    );
    const taskId = (started.structuredContent as { taskId: string }).taskId;
    const completed = await tool.handler({ taskId }, context());

    expect(started.structuredContent).toMatchObject({
      status: "researching",
      dossier: null,
      taskId,
      progress: { stage: "researching", done: 0, total: 1 },
    });
    expect(dossierOutputSchema.safeParse(completed.structuredContent).success).toBe(true);
    expect(completed.structuredContent).toMatchObject({
      tab: "people",
      status: "complete",
      dossier: { company: "Example Labs" },
      taskId,
      progress: { stage: "done", done: 1, total: 1 },
    });
    expect(await db.select().from(notes)).toHaveLength(1);
    expect(await db.select().from(apiUsage)).toHaveLength(1);
  });

  it("never starts a fourth user attempt in one UTC day", async () => {
    const operations = {
      start: vi.fn(async () => ({
        sessionId: crypto.randomUUID(),
        status: "in_progress" as const,
      })),
      poll: vi.fn(async () => ({ status: "researching" as const })),
    };
    const tool = createDossierTools(operations)[0];
    for (let attempt = 0; attempt < 3; attempt++)
      await tool.handler({ company: `Example ${attempt}` }, context());
    const capped = await tool.handler({ company: "One too many" }, context());

    expect(capped.structuredContent).toMatchObject({ status: "rate_limited", dossier: null });
    expect(operations.start).toHaveBeenCalledTimes(3);
    expect(await db.select().from(apiUsage)).toHaveLength(3);
  });

  it("returns a bounded unavailable state without saving on agent failure", async () => {
    const tool = createDossierTools({
      start: async () => {
        throw new Error("private upstream detail");
      },
      poll: async () => ({ status: "researching" }),
    })[0];
    const result = await tool.handler({ company: "Example Labs" }, context());

    expect(result.structuredContent).toMatchObject({
      status: "unavailable",
      dossier: null,
      noteId: null,
      progress: { stage: "done", done: 0, total: 1 },
    });
    expect(JSON.stringify(result)).not.toContain("private upstream detail");
    expect(await db.select().from(notes)).toEqual([]);
    expect(await db.select().from(apiUsage)).toHaveLength(1);
  });

  it("does not spend quota when disabled or input is invalid", async () => {
    const operations = {
      start: vi.fn(async () => ({ sessionId: "session-1", status: "in_progress" as const })),
      poll: vi.fn(async () => ({ status: "researching" as const })),
    };
    const tool = createDossierTools(operations)[0];
    const disabled = await tool.handler(
      { company: "Example Labs" },
      context({ AGENTS_ENABLED: "0" }),
    );
    const invalid = await tool.handler({ company: "", website: "javascript:alert(1)" }, context());

    expect(disabled.structuredContent).toMatchObject({ status: "disabled" });
    expect(invalid.isError).toBe(true);
    expect(operations.start).not.toHaveBeenCalled();
    expect(await db.select().from(apiUsage)).toEqual([]);
  });

  it("does not reveal or poll another user's task", async () => {
    const operations = {
      start: vi.fn(async () => ({ sessionId: "session-1", status: "in_progress" as const })),
      poll: vi.fn(async () => ({ status: "researching" as const })),
    };
    const tool = createDossierTools(operations)[0];
    const started = await tool.handler({ company: "Example Labs" }, context());
    const taskId = (started.structuredContent as { taskId: string }).taskId;
    const other = { ...context(), userId: "b", identity: { userId: "b", name: "B" } };
    await db.insert(users).values({ id: "b", displayName: "B", createdAt: now, updatedAt: now });
    const result = await tool.handler({ taskId }, other);

    expect(result.isError).toBe(true);
    expect(operations.poll).not.toHaveBeenCalled();
  });
});
