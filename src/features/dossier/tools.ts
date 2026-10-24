import { z } from "zod";
import type { Env } from "../../env";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { dossierSchema, pollDossierAgent, startDossierAgent } from "./agent";
import { dossierCopy as copy } from "./copy";
import { claimDossierRun, completeDossierTask, getDossierTask, putDossierTask } from "./repo";

const inputShape = {
  company: z.string().trim().min(1).max(200).optional(),
  website: z
    .url({ protocol: /^https?$/ })
    .max(2_048)
    .optional(),
  taskId: z.string().trim().min(1).max(200).optional(),
};
const inputSchema = z
  .object(inputShape)
  .strict()
  .refine(
    (value) => (value.taskId ? !value.company && !value.website : Boolean(value.company)),
    "Provide either a company to start or a taskId to check.",
  );
export const dossierOutputSchema = z.object({
  tab: z.literal("people"),
  status: z.enum(["researching", "complete", "unavailable", "rate_limited", "disabled"]),
  company: z.string(),
  dossier: dossierSchema.nullable(),
  noteId: z.string().nullable(),
  taskId: z.string().nullable(),
  progress: z.object({
    stage: z.enum(["researching", "done"]),
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export interface DossierAgentOperations {
  start: typeof startDossierAgent;
  poll: typeof pollDossierAgent;
}
const defaultOperations: DossierAgentOperations = {
  start: startDossierAgent,
  poll: pollDossierAgent,
};
type DossierEnv = Env & {
  AGENTS_ENABLED?: string;
  AGENTS_GLOBAL_DAILY_CAP?: string;
};

function integerSetting(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function unavailable(
  company: string,
  status: "unavailable" | "rate_limited" | "disabled",
  taskId: string | null = null,
) {
  const message =
    status === "disabled"
      ? copy.disabled
      : status === "rate_limited"
        ? copy.limited
        : copy.unavailable;
  return ok(message, {
    tab: "people" as const,
    status,
    company,
    dossier: null,
    noteId: null,
    taskId,
    progress: { stage: "done" as const, done: 0, total: status === "disabled" ? 0 : 1 },
  });
}

function validated(
  operations: DossierAgentOperations,
  action: (
    args: z.infer<typeof inputSchema>,
    ctx: ToolContext,
    operations: DossierAgentOperations,
  ) => Promise<ToolResult>,
): ToolDef["handler"] {
  return async (args, ctx) => {
    const parsed = inputSchema.safeParse(args);
    if (!parsed.success)
      return fail(
        "INVALID_INPUT",
        "Provide a company name and, optionally, its HTTP or HTTPS website.",
        "No research was started.",
      );
    return action(parsed.data, ctx, operations);
  };
}

export function createDossierTools(
  operations: DossierAgentOperations = defaultOperations,
): ToolDef[] {
  return [
    {
      name: "run_company_dossier",
      title: "Research a company",
      description:
        "Use this to start cited company research with the OpenAI Agents API and live public web search, or pass its taskId to check progress and save the completed company note. Do not use it for private-person research, uncited claims, interview-loop reports, or more than three starts per user per day. Next, call this tool again with taskId while status is researching; when complete, review the evidence in People and use get_prep_context or draft outreach in ChatGPT.",
      input: inputShape,
      output: dossierOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      status: {
        invoking: "Sending a research agent into the corporate website…",
        invoked: "Dossier research started or checked.",
      },
      opensPanel: true,
      handler: validated(operations, async (args, ctx, agent) => {
        const agentEnv = ctx.env as DossierEnv;
        if (agentEnv.AGENTS_ENABLED !== "1" || !agentEnv.OPENAI_API_KEY)
          return unavailable(args.company ?? "Company", "disabled", args.taskId ?? null);

        if (args.taskId) {
          const task = await getDossierTask(ctx.db, ctx.userId, args.taskId);
          if (!task)
            return fail(
              "NOT_FOUND",
              "Dossier research task not found.",
              "Start a new dossier with a company name.",
            );
          if (task.status === "done" && task.dossier)
            return ok(copy.complete, {
              tab: "people",
              status: "complete",
              company: task.company,
              dossier: task.dossier,
              noteId: task.noteId,
              taskId: task.taskId,
              progress: { stage: "done", done: 1, total: 1 },
            });
          if (task.status === "error") return unavailable(task.company, "unavailable", task.taskId);
          try {
            const result = await agent.poll(
              agentEnv.OPENAI_API_KEY,
              task.sessionId,
              {
                company: task.company,
                ...(task.website ? { website: task.website } : {}),
                researchedAt: task.researchedAt,
              },
              { timeoutMs: 4_000 },
            );
            if (result.status === "researching")
              return ok(copy.researching, {
                tab: "people",
                status: "researching",
                company: task.company,
                dossier: null,
                noteId: null,
                taskId: task.taskId,
                progress: { stage: "researching", done: 0, total: 1 },
              });
            const completed = await completeDossierTask(
              ctx.db,
              ctx.userId,
              task,
              result.dossier,
              ctx.now().getTime(),
            );
            return ok(copy.complete, {
              tab: "people",
              status: "complete",
              company: task.company,
              dossier: result.dossier,
              noteId: completed.noteId,
              taskId: task.taskId,
              progress: { stage: "done", done: 1, total: 1 },
            });
          } catch {
            try {
              await putDossierTask(
                ctx.db,
                ctx.userId,
                {
                  ...task,
                  status: "error",
                  progress: { stage: "done", done: 0, total: 1 },
                },
                ctx.now().getTime(),
              );
            } catch {
              // Preserve the bounded fallback even if task-state persistence is unavailable.
            }
            return unavailable(task.company, "unavailable", task.taskId);
          }
        }

        const current = ctx.now();
        const dayStart = Date.UTC(
          current.getUTCFullYear(),
          current.getUTCMonth(),
          current.getUTCDate(),
        );
        const claim = await claimDossierRun(
          ctx.db,
          ctx.userId,
          {
            user: 3,
            global: integerSetting(agentEnv.AGENTS_GLOBAL_DAILY_CAP, 100, 0, 10_000),
            since: dayStart,
          },
          current.getTime(),
        );
        const company = args.company as string;
        if (claim !== "ok") return unavailable(company, "rate_limited");

        try {
          const started = await agent.start(
            agentEnv.OPENAI_API_KEY,
            { company, ...(args.website ? { website: args.website } : {}) },
            { timeoutMs: 4_000 },
          );
          if (started.status === "failed" || started.status === "requires_action")
            return unavailable(company, "unavailable");
          const taskId = `dossier-${crypto.randomUUID()}`;
          const noteId = `dossier-note-${crypto.randomUUID()}`;
          await putDossierTask(
            ctx.db,
            ctx.userId,
            {
              taskId,
              sessionId: started.sessionId,
              noteId,
              company,
              ...(args.website ? { website: args.website } : {}),
              researchedAt: current.getTime(),
              status: "running",
              progress: { stage: "researching", done: 0, total: 1 },
            },
            ctx.now().getTime(),
          );
          return ok(copy.researching, {
            tab: "people",
            status: "researching",
            company,
            dossier: null,
            noteId: null,
            taskId,
            progress: { stage: "researching", done: 0, total: 1 },
          });
        } catch {
          return unavailable(company, "unavailable");
        }
      }),
    },
  ];
}

export const dossierTools = createDossierTools();
