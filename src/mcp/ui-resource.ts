import type { McpServer } from "@modelcontextprotocol/server";
import { PANEL_HTML } from "./panel-html.generated";

export const UI_RESOURCE_URI = "ui://self-deprecation/panel";
export const MCP_APP_MIME = "text/html;profile=mcp-app";

export function registerUiResource(server: McpServer, html = PANEL_HTML): void {
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
