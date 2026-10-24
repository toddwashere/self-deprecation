import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../db/client";
import { apiUsage, notes, userState, users } from "../../db/schema";
import type { Env } from "../../env";
import type { ToolContext } from "../../mcp/types";
import { coreTools } from "../core/tools";
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
    const taskStatus = await (
      coreTools.find((item) => item.name === "get_task_status") as NonNullable<
        (typeof coreTools)[number]
      >
    ).handler({ taskId }, context());

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
    expect(taskStatus.structuredContent).toMatchObject({
      taskId,
      status: "done",
      progress: { stage: "done", done: 1, total: 1 },
    });
    expect(await db.select().from(notes)).toHaveLength(1);
    expect(await db.select().from(apiUsage)).toHaveLength(1);
  });

  it("stores shared running progress and returns one stable note for concurrent completion polls", async () => {
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let polls = 0;
    const operations = {
      start: vi.fn(async () => ({ sessionId: "session-1", status: "in_progress" as const })),
      poll: vi.fn(async () => {
        polls += 1;
        if (polls === 2) release?.();
        await wait;
        return { status: "complete" as const, dossier };
      }),
    };
    const tool = createDossierTools(operations)[0];
    const started = await tool.handler({ company: "Example Labs" }, context());
    const taskId = (started.structuredContent as { taskId: string }).taskId;
    const taskTool = coreTools.find((item) => item.name === "get_task_status") as NonNullable<
      (typeof coreTools)[number]
    >;
    const running = await taskTool.handler({ taskId }, context());
    const [first, second] = await Promise.all([
      tool.handler({ taskId }, context()),
      tool.handler({ taskId }, context()),
    ]);

    expect(running.structuredContent).toMatchObject({
      taskId,
      status: "running",
      progress: { stage: "researching", done: 0, total: 1 },
    });
    expect(first.structuredContent).toMatchObject({ status: "complete" });
    expect(second.structuredContent).toMatchObject({ status: "complete" });
    expect((first.structuredContent as { noteId: string }).noteId).toBe(
      (second.structuredContent as { noteId: string }).noteId,
    );
    expect(await db.select().from(notes)).toHaveLength(1);
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

  it("persists a shared error task state when polling fails", async () => {
    const operations = {
      start: vi.fn(async () => ({ sessionId: "session-1", status: "in_progress" as const })),
      poll: vi.fn(async () => {
        throw new Error("private upstream detail");
      }),
    };
    const tool = createDossierTools(operations)[0];
    const started = await tool.handler({ company: "Example Labs" }, context());
    const taskId = (started.structuredContent as { taskId: string }).taskId;
    await tool.handler({ taskId }, context());
    const taskStatus = await (
      coreTools.find((item) => item.name === "get_task_status") as NonNullable<
        (typeof coreTools)[number]
      >
    ).handler({ taskId }, context());

    expect(taskStatus.structuredContent).toMatchObject({
      taskId,
      status: "error",
      progress: { stage: "done", done: 0, total: 1 },
    });
    expect(JSON.stringify(taskStatus)).not.toContain("private upstream detail");
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
