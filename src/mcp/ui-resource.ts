import type { McpServer } from "@modelcontextprotocol/server";

export const UI_RESOURCE_URI = "ui://self-deprecation/panel";
export const MCP_APP_MIME = "text/html;profile=mcp-app";

const PLACEHOLDER_PANEL_HTML = `<!doctype html>
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

export function registerUiResource(server: McpServer, html = PLACEHOLDER_PANEL_HTML): void {
  server.registerResource(
    "self-deprecation-panel",
    UI_RESOURCE_URI,
    {
      title: "Self-Deprecation",
      description: "Tabbed workspace for the Self-Deprecation career migration guide.",
      mimeType: MCP_APP_MIME,
    },
    async () => ({ contents: [{ uri: UI_RESOURCE_URI, mimeType: MCP_APP_MIME, text: html }] }),
  );
}
