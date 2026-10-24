import { McpServer } from "@modelcontextprotocol/server";
import { OpenAIExtensions, type OpenAIUiToolMetadata } from "@openai/mcp-extensions/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { Env } from "./env";

const UI_URI = "ui://self-deprecation/hello";
const MCP_APP_MIME = "text/html;profile=mcp-app";

const HELLO_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Self-Deprecation</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; padding: 24px; background: Canvas; color: CanvasText; }
      main { max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 18px; }
      .eyebrow { margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .7; }
      h1 { margin: 0 0 12px; font-size: clamp(24px, 6vw, 40px); line-height: 1.05; }
      p { margin: 8px 0; line-height: 1.55; }
      .status { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; padding: 8px 12px; border-radius: 999px; background: color-mix(in srgb, #34d399 16%, Canvas); }
      .dot { width: 8px; height: 8px; border-radius: 999px; background: #10b981; }
    </style>
  </head>
  <body>
    <main aria-labelledby="title">
      <p class="eyebrow">Status: Deprecated (still supported)</p>
      <h1 id="title">Hello from Self-Deprecation</h1>
      <p>The robots found the server. Awkward.</p>
      <p>Your migration guide is online, and you are still shipping.</p>
      <p class="status" role="status"><span class="dot" aria-hidden="true"></span>Connection healthy</p>
    </main>
  </body>
</html>`;

const pingOutputSchema = z.object({
  status: z.literal("ok"),
  message: z.string(),
});

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Self-Deprecation",
    version: "0.1.0",
  });

  // This constructor registers OpenAI's optional MCP extension capabilities.
  // Keeping it in the Worker is the F1 compatibility spike for the server SDK.
  new OpenAIExtensions(server);

  server.registerResource(
    "self-deprecation-hello",
    UI_URI,
    {
      title: "Self-Deprecation",
      description: "Hello-world panel for the Self-Deprecation connection check.",
      mimeType: MCP_APP_MIME,
    },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: MCP_APP_MIME,
          text: HELLO_HTML,
        },
      ],
    }),
  );

  server.registerTool(
    "ping",
    {
      title: "Ping Self-Deprecation",
      description:
        "Checks that Self-Deprecation and its panel are reachable. Use it to verify a new or refreshed plugin connection. Do not use it for career data or job searches. Next, open the rendered panel to confirm the UI resource loads.",
      inputSchema: z.object({}),
      outputSchema: pingOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: UI_URI },
        "openai/ui": {
          entrypoints: [{ type: "thread" }, { type: "global" }],
        } satisfies OpenAIUiToolMetadata,
        "openai/toolInvocation/invoking": "Checking whether you're deprecated yet…",
        "openai/toolInvocation/invoked": "Still supported. Migration ready.",
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "Self-Deprecation is online. You're still supported, and the migration guide is ready.",
        },
      ],
      structuredContent: {
        status: "ok" as const,
        message: "Connection healthy",
      },
    }),
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer, { route: "/mcp" });

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Self-Deprecation MCP server", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (request.method === "OPTIONS" && url.pathname === "/mcp") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-headers": "content-type, mcp-protocol-version",
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "Mcp-Session-Id",
        },
      });
    }

    if (url.pathname === "/mcp" && ["GET", "POST", "DELETE"].includes(request.method)) {
      return mcpHandler(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
