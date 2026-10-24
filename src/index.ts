import { OAuthProvider, type OAuthResourceContext } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { githubAuthHandler } from "./auth/github-handler";
import { localAuthProps, resolveUserId } from "./auth/guards";
import type { AuthProps } from "./auth/types";
import type { Env } from "./env";
import { createServer } from "./mcp/server";

function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  profile: AuthProps,
): Promise<Response> {
  const handler = createMcpHandler(() => createServer(env, profile), { route: "/mcp" });
  return handler(request, env, ctx);
}

function createOAuthProvider(env: Env) {
  const resource = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/mcp`;
  const issuer = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: {
      fetch(request, apiEnv, ctx) {
        const oauthContext = ctx as OAuthResourceContext<AuthProps>;
        const userId = resolveUserId(apiEnv, oauthContext.props);
        return handleMcp(request, apiEnv, ctx, { ...oauthContext.props, userId });
      },
    },
    defaultHandler: githubAuthHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["mcp:read", "offline_access"],
    resourceMetadata: { resource, authorization_servers: [issuer] },
    requiredScopes: ["mcp:read"],
    clientIdMetadataDocumentEnabled: true,
  });
}

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
      try {
        const userId = resolveUserId(env, undefined);
        return handleMcp(request, env, ctx, localAuthProps(userId));
      } catch (error) {
        if (env.DEV_AUTH_BYPASS === "1") {
          return new Response(
            error instanceof Error ? error.message : "Invalid auth configuration",
            { status: 500 },
          );
        }
      }
    }

    return createOAuthProvider(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
