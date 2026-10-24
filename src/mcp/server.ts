import { McpServer } from "@modelcontextprotocol/server";
import { OpenAIExtensions, type OpenAIUiToolMetadata } from "@openai/mcp-extensions/server";
import { z } from "zod";
import type { AuthProps } from "../auth/types";
import { createDb } from "../db/client";
import type { Env } from "../env";
import { createLogger } from "../lib/log";
import { listTools } from "./registry";
import type { ToolContext, ToolDef } from "./types";
import { registerUiResource, UI_RESOURCE_URI } from "./ui-resource";

const SECURITY_SCHEMES = [{ type: "oauth2", scopes: ["mcp:read"] }] as const;

function toolMeta(tool: ToolDef): Record<string, unknown> {
  return {
    ...tool.meta,
    "openai/toolInvocation/invoking": tool.status.invoking,
    "openai/toolInvocation/invoked": tool.status.invoked,
    securitySchemes: SECURITY_SCHEMES,
    ...(tool.opensPanel
      ? {
          ui: { resourceUri: UI_RESOURCE_URI },
          "openai/ui": {
            entrypoints: [{ type: "thread" }, { type: "global" }],
          } satisfies OpenAIUiToolMetadata,
        }
      : {}),
  };
}

export function createServer(env: Env, identity: AuthProps): McpServer {
  const server = new McpServer({ name: "Self-Deprecation", version: "0.1.0" });
  new OpenAIExtensions(server);
  registerUiResource(server);

  const context: ToolContext = {
    userId: identity.userId,
    identity,
    db: createDb(env.DB),
    env,
    now: () => new Date(),
    log: createLogger("mcp"),
  };

  for (const tool of listTools()) {
    const config = {
      title: tool.title,
      description: tool.description,
      inputSchema: z.object(tool.input),
      ...(tool.output ? { outputSchema: tool.output } : {}),
      annotations: tool.annotations,
      _meta: toolMeta(tool),
    };
    server.registerTool(
      tool.name,
      config as never,
      (async (args: Record<string, unknown>) => tool.handler(args as never, context)) as never,
    );
  }

  return server;
}
