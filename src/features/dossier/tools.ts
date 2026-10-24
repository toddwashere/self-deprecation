import { z } from "zod";
import type { Env } from "../../env";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { dossierSchema, runDossierAgent } from "./agent";
import { dossierCopy as copy } from "./copy";
import { claimDossierRun, saveDossier } from "./repo";

const inputShape = {
  company: z.string().trim().min(1).max(200),
  website: z
    .url({ protocol: /^https?$/ })
    .max(2_048)
    .optional(),
};
const inputSchema = z.object(inputShape).strict();
export const dossierOutputSchema = z.object({
  tab: z.literal("people"),
  status: z.enum(["complete", "unavailable", "rate_limited", "disabled"]),
  company: z.string(),
  dossier: dossierSchema.nullable(),
  noteId: z.string().nullable(),
  progress: z.object({
    stage: z.literal("done"),
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

type RunDossier = typeof runDossierAgent;
type DossierEnv = Env & {
  AGENTS_ENABLED?: string;
  AGENTS_GLOBAL_DAILY_CAP?: string;
};

function integerSetting(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function unavailable(company: string, status: "unavailable" | "rate_limited" | "disabled") {
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
    progress: { stage: "done" as const, done: 0, total: status === "disabled" ? 0 : 1 },
  });
}

function validated(
  run: RunDossier,
  action: (
    args: z.infer<typeof inputSchema>,
    ctx: ToolContext,
    run: RunDossier,
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
    return action(parsed.data, ctx, run);
  };
}

export function createDossierTools(run: RunDossier = runDossierAgent): ToolDef[] {
  return [
    {
      name: "run_company_dossier",
      title: "Research a company",
      description:
        "Use this to research a named company with the OpenAI Agents API and live public web search, then save a cited company note for the signed-in person. Do not use it for private-person research, uncited claims, interview-loop reports, or more than three attempts per user per day. Next, review the saved evidence in People and use get_prep_context or draft outreach in ChatGPT.",
      input: inputShape,
      output: dossierOutputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      status: {
        invoking: "Sending a research agent into the corporate website…",
        invoked: "Dossier research finished.",
      },
      opensPanel: true,
      handler: validated(run, async (args, ctx, execute) => {
        const agentEnv = ctx.env as DossierEnv;
        if (agentEnv.AGENTS_ENABLED !== "1" || !agentEnv.OPENAI_API_KEY)
          return unavailable(args.company, "disabled");

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
        if (claim !== "ok") return unavailable(args.company, "rate_limited");

        try {
          const dossier = await execute(
            agentEnv.OPENAI_API_KEY,
            { company: args.company, ...(args.website ? { website: args.website } : {}) },
            { timeoutMs: 6_500 },
          );
          const note = await saveDossier(
            ctx.db,
            ctx.userId,
            args.company,
            dossier,
            ctx.now().getTime(),
          );
          return ok(copy.complete, {
            tab: "people",
            status: "complete",
            company: args.company,
            dossier,
            noteId: note?.id ?? null,
            progress: { stage: "done", done: 1, total: 1 },
          });
        } catch {
          return unavailable(args.company, "unavailable");
        }
      }),
    },
  ];
}

export const dossierTools = createDossierTools();
