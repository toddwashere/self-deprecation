import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { getTaskState } from "./repo";

const pingOutput = z.object({ status: z.literal("ok"), message: z.string() });
const profileOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  nickname: z.string().optional(),
});
const taskOutput = z.object({
  taskId: z.string(),
  status: z.enum(["pending", "running", "done", "error"]),
  progress: z
    .object({
      stage: z.string(),
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .optional(),
});

export const coreTools: ToolDef[] = [
  {
    name: "ping",
    title: "Ping Self-Deprecation",
    description:
      "Use this to verify a new or refreshed Self-Deprecation connection and panel. Do not use it for career data or job searches. Next, inspect the rendered panel to confirm the UI resource loads.",
    input: {},
    output: pingOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: {
      invoking: "Checking whether you're deprecated yet…",
      invoked: "Still supported. Migration ready.",
    },
    opensPanel: true,
    handler: async () =>
      ok("Self-Deprecation is online. You're still supported, and the migration guide is ready.", {
        status: "ok",
        message: "Connection healthy",
      }),
  },
  {
    name: "get_profile",
    title: "Get signed-in profile",
    description:
      "Use this to confirm which verified account is connected. Do not use it to fetch career criteria or resume data. Next, use open_dashboard to view the workspace.",
    input: {},
    output: profileOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Checking your identity…", invoked: "Identity verified. Still you." },
    meta: { "openai/profile": true },
    handler: async (_args, ctx) =>
      ok(`Signed in as ${ctx.identity.name}.`, {
        id: ctx.userId,
        name: ctx.identity.name,
        ...(ctx.identity.email ? { email: ctx.identity.email } : {}),
        ...(ctx.identity.nickname ? { nickname: ctx.identity.nickname } : {}),
      }),
  },
  {
    name: "get_task_status",
    title: "Get task progress",
    description:
      "Use this to poll progress for a task ID returned by a long-running Self-Deprecation tool. Do not use it without a task ID or for historical activity. Next, poll until the status is done or show the returned error.",
    input: { taskId: z.string().min(1).max(100) },
    output: taskOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: { invoking: "Checking the robot queue…", invoked: "Progress checked." },
    handler: async (args, ctx) => {
      const taskId = z.string().min(1).max(100).parse(args.taskId);
      const state = await getTaskState(ctx.db, ctx.userId, taskId);
      if (!state || typeof state !== "object") {
        return fail("NOT_FOUND", "That task was not found.", "Check the task ID and try again.");
      }
      const parsed = taskOutput.safeParse({ taskId, ...(state as Record<string, unknown>) });
      return parsed.success
        ? ok(`Task ${taskId} is ${parsed.data.status}.`, parsed.data)
        : fail("INTERNAL", "The saved task status is invalid.");
    },
  },
];
