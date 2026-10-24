import { z } from "zod";
import demoData from "../../../seed/demo-todd.json";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import {
  getDashboardCounts,
  getTaskState,
  hasJobCriteria,
  loadDemoData,
  resetUserData,
} from "./repo";

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
const tabSchema = z.enum([
  "today",
  "jobs",
  "people",
  "prep",
  "events",
  "news",
  "money",
  "level",
  "profile",
  "settings",
]);
const dashboardOutput = z.object({
  tab: tabSchema,
  identity: profileOutput,
  counts: z.object({
    jobs: z.number().int().nonnegative(),
    contacts: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
  }),
});
const actionOutput = z.object({ message: z.string() });
const demoOutput = actionOutput.extend({
  loaded: z.object({ contacts: z.number(), notes: z.number(), events: z.number() }),
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
  {
    name: "open_dashboard",
    title: "Open career dashboard",
    description:
      "Use this to open the Self-Deprecation panel on a requested tab and show current workspace counts. Do not use it to change data. Next, help with the selected tab or offer to load demo data if the workspace is empty.",
    input: { tab: tabSchema.optional() },
    output: dashboardOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    status: {
      invoking: "Opening your migration guide…",
      invoked: "Dashboard open. Still shipping.",
    },
    opensPanel: true,
    handler: async (args, ctx) => {
      const requestedTab = tabSchema.optional().catch(undefined).parse(args.tab);
      const tab =
        requestedTab ?? ((await hasJobCriteria(ctx.db, ctx.userId)) ? "today" : "profile");
      const counts = await getDashboardCounts(ctx.db, ctx.userId);
      return ok("Opened your Self-Deprecation dashboard.", {
        tab,
        identity: {
          id: ctx.userId,
          name: ctx.identity.name,
          ...(ctx.identity.email ? { email: ctx.identity.email } : {}),
          ...(ctx.identity.nickname ? { nickname: ctx.identity.nickname } : {}),
        },
        counts,
      });
    },
  },
  {
    name: "reset_my_data",
    title: "Reset my workspace data",
    description:
      "Use this only when the signed-in person explicitly asks to erase their Self-Deprecation workspace and confirms RESET. Do not use it for cleanup, logout, or another person's data. Next, confirm the clean install or offer to load demo data.",
    input: { confirm: z.string() },
    output: actionOutput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: { invoking: "Running rm -rf on your data…", invoked: "Clean install complete." },
    handler: async (args, ctx) => {
      if (args.confirm !== "RESET") {
        return fail("INVALID_INPUT", "Reset requires confirm: RESET.", "No data was changed.");
      }
      await resetUserData(ctx.db, ctx.userId, ctx.now().getTime());
      return ok("Your workspace data was reset. Your login is still intact.", {
        message: "Clean install complete. Your identity is still supported.",
      });
    },
  },
  {
    name: "load_demo_data",
    title: "Load public-safe demo data",
    description:
      "Use this to replace the caller's workspace with the public-safe demo persona for rehearsal. Do not use it when the person wants to keep existing workspace data. Next, open the Today or Settings tab to review the loaded demo.",
    input: {},
    output: demoOutput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: {
      invoking: "Restoring the demo save point…",
      invoked: "Demo loaded. Rehearsal ready.",
    },
    handler: async (_args, ctx) => {
      const loaded = await loadDemoData(ctx.db, ctx.userId, demoData, ctx.now().getTime());
      return ok("Public-safe demo data is loaded.", {
        message: "Demo loaded. No actual career casualties.",
        loaded,
      });
    },
  },
];
