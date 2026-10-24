import type { z } from "zod";
import type { AuthProps } from "../auth/types";
import type { DB } from "../db/client";
import type { Env } from "../env";
import type { Logger } from "../lib/log";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface ToolContext {
  userId: string;
  identity: AuthProps;
  db: DB;
  env: Env;
  now: () => Date;
  log: Logger;
}

export interface ToolDef<I extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: I;
  output?: z.ZodTypeAny;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint?: boolean;
  };
  status: { invoking: string; invoked: string };
  opensPanel?: boolean;
  meta?: Record<string, unknown>;
  handler: (args: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface CronJob {
  id: string;
  cron: string;
  run: (env: Env) => Promise<void>;
}

export interface FeatureModule {
  id: string;
  tools: ToolDef[];
  cron?: CronJob[];
}
