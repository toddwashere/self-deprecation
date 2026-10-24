import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const baseUrl = (process.env.MCP_BASE_URL ?? "https://self-deprecation.metodd.workers.dev").replace(
  /\/$/,
  "",
);
const mcpUrl = `${baseUrl}/mcp`;

async function checkedFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path}: HTTP ${response.status}`);
  return response;
}

async function checkPublicSurface() {
  const health = await checkedFetch("/");
  if ((await health.text()) !== "Self-Deprecation MCP server") {
    throw new Error("Health response did not identify the MCP server");
  }

  const resource = (await (
    await checkedFetch("/.well-known/oauth-protected-resource/mcp")
  ).json()) as { resource?: string; authorization_servers?: string[] };
  if (resource.resource !== mcpUrl || !resource.authorization_servers?.includes(baseUrl)) {
    throw new Error("Protected-resource metadata does not describe the production MCP endpoint");
  }

  const authorization = (await (
    await checkedFetch("/.well-known/oauth-authorization-server")
  ).json()) as { issuer?: string; authorization_endpoint?: string; token_endpoint?: string };
  if (
    authorization.issuer !== baseUrl ||
    authorization.authorization_endpoint !== `${baseUrl}/authorize` ||
    authorization.token_endpoint !== `${baseUrl}/oauth/token`
  ) {
    throw new Error("Authorization-server metadata is incomplete or points at another origin");
  }

  const preflight = await checkedFetch("/mcp", { method: "OPTIONS" });
  if (!preflight.headers.get("access-control-allow-methods")?.includes("POST")) {
    throw new Error("MCP CORS preflight does not allow POST");
  }
}

async function checkAuthenticatedMcp(token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "self-deprecation-production-smoke", version: "0.1.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    if (!listed.tools.some((tool) => tool.name === "ping")) {
      throw new Error("Authenticated MCP discovery did not include ping");
    }
    const ping = await client.callTool({ name: "ping", arguments: {} });
    if (
      ping.isError ||
      (ping.structuredContent as { status?: string } | undefined)?.status !== "ok"
    ) {
      throw new Error("Authenticated ping did not return status=ok");
    }
    return listed.tools.length;
  } finally {
    await transport.close();
  }
}

await checkPublicSurface();
const token = process.env.MCP_ACCESS_TOKEN;
if (token) {
  const toolCount = await checkAuthenticatedMcp(token);
  console.log(`Production smoke passed: OAuth discovery + ${toolCount} tools + ping`);
} else {
  console.log("Production smoke passed: health, OAuth discovery, and MCP preflight");
  console.log("Set MCP_ACCESS_TOKEN to include authenticated tool discovery and ping.");
}
