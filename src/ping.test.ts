import { createExecutionContext, env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import worker from "./index";

const MCP_URL = "http://localhost/mcp";
const UI_URI = "ui://self-deprecation/panel";
const MCP_APP_MIME = "text/html;profile=mcp-app";

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

async function mcpRequest<T>(id: number, method: string, params?: object): Promise<T> {
  const response = await SELF.fetch(MCP_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "localhost",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (response.status !== 200) {
    throw new Error(`MCP ${method} failed with ${response.status}: ${await response.text()}`);
  }
  const body = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? body
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length)
    : body;
  if (!data) {
    throw new Error(`MCP ${method} returned no JSON-RPC payload`);
  }
  const payload = JSON.parse(data) as JsonRpcResponse<T>;
  expect(payload.jsonrpc).toBe("2.0");
  expect(payload.id).toBe(id);
  return payload.result;
}

describe("F1 Worker", () => {
  it("serves health, CORS preflight, and a 404 fallback", async () => {
    const health = await SELF.fetch("http://localhost/");
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("Self-Deprecation MCP server");

    const preflight = await SELF.fetch(MCP_URL, {
      method: "OPTIONS",
      headers: { origin: "https://chatgpt.com" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    const missing = await SELF.fetch("http://localhost/nope");
    expect(missing.status).toBe(404);
  });

  it("advertises ping with the required MCP App and ChatGPT metadata", async () => {
    const result = await mcpRequest<{
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: object;
        outputSchema?: object;
        annotations?: object;
        _meta?: Record<string, unknown>;
      }>;
    }>(1, "tools/list", {});

    expect(result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "ping",
        "get_profile",
        "get_task_status",
        "open_dashboard",
        "reset_my_data",
        "load_demo_data",
      ]),
    );
    for (const tool of result.tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
      expect(tool.description).toContain("Do not");
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
      expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["mcp:read"] }]);
      expect(String(tool._meta?.["openai/toolInvocation/invoking"]).length).toBeLessThanOrEqual(64);
      expect(String(tool._meta?.["openai/toolInvocation/invoked"]).length).toBeLessThanOrEqual(64);
    }
    const ping = result.tools.find((tool) => tool.name === "ping");
    expect(ping).toMatchObject({
      name: "ping",
      description: expect.stringContaining("Do not use"),
      inputSchema: { type: "object" },
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "string", const: "ok" },
          message: { type: "string" },
        },
        required: ["status", "message"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: UI_URI },
        "openai/ui": {
          entrypoints: [{ type: "thread" }, { type: "global" }],
        },
        "openai/toolInvocation/invoking": "Checking whether you're deprecated yet…",
        "openai/toolInvocation/invoked": "Still supported. Migration ready.",
      },
    });

    expect(result.tools.find((tool) => tool.name === "get_profile")).toMatchObject({
      name: "get_profile",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/profile": true,
        securitySchemes: [{ type: "oauth2", scopes: ["mcp:read"] }],
      },
    });
  });

  it("returns a typed ping result and the hello-world UI resource", async () => {
    const toolResult = await mcpRequest<{
      content: Array<{ type: string; text: string }>;
      structuredContent: { status: string; message: string };
    }>(2, "tools/call", { name: "ping", arguments: {} });

    expect(toolResult).toEqual({
      content: [
        {
          type: "text",
          text: "Self-Deprecation is online. You're still supported, and the migration guide is ready.",
        },
      ],
      structuredContent: {
        status: "ok",
        message: "Connection healthy",
      },
    });

    const resourceResult = await mcpRequest<{
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    }>(3, "resources/read", { uri: UI_URI });

    expect(resourceResult.contents).toHaveLength(1);
    expect(resourceResult.contents[0]).toMatchObject({
      uri: UI_URI,
      mimeType: MCP_APP_MIME,
    });
    expect(resourceResult.contents[0].text).toContain("Your career migration guide");
    expect(resourceResult.contents[0].text).toContain("Load demo data");
    expect(new TextEncoder().encode(resourceResult.contents[0].text).byteLength).toBeLessThan(
      400_000,
    );
    expect(resourceResult.contents[0].text).not.toMatch(/<script[^>]+src=/);
  });

  it("accepts the shared structured error shape for typed tools", async () => {
    const result = await mcpRequest<{
      isError: boolean;
      content: Array<{ type: string; text: string }>;
      structuredContent?: unknown;
      _meta: { "self-deprecation/error": { code: string; message: string; hint?: string } };
    }>(4, "tools/call", {
      name: "reset_my_data",
      arguments: { confirm: "NOT_RESET" },
    });

    expect(result).toMatchObject({
      isError: true,
      _meta: {
        "self-deprecation/error": {
          code: "INVALID_INPUT",
          message: "Reset requires confirm: RESET.",
        },
      },
    });
    expect(result.structuredContent).toBeUndefined();
  });

  it("returns the bypass profile locally and challenges anonymous production calls", async () => {
    const profile = await mcpRequest<{
      structuredContent: { id: string; name: string; email?: string; nickname?: string };
    }>(4, "tools/call", {
      name: "get_profile",
      arguments: { userId: "forged-user" },
    });
    expect(profile.structuredContent).toEqual({
      id: "dev-user",
      name: "Local Developer",
      nickname: "dev",
    });

    const productionEnv = {
      ...env,
      ENVIRONMENT: "production",
      DEV_AUTH_BYPASS: "0",
      PUBLIC_BASE_URL: "https://self-deprecation.metodd.workers.dev",
    } as unknown as Env;
    const response = await worker.fetch(
      new Request("https://self-deprecation.metodd.workers.dev/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }) as unknown as Parameters<NonNullable<typeof worker.fetch>>[0],
      productionEnv,
      createExecutionContext(),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});
