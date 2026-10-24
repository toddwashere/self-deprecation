import type { ToolResult } from "./types";

export type ErrorCode =
  | "NEEDS_CRITERIA"
  | "NOT_FOUND"
  | "SOURCE_UNAVAILABLE"
  | "SCORING_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "INTERNAL";

export function ok<T extends Record<string, unknown>>(text: string, structured: T): ToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structured,
  };
}

export function fail(code: ErrorCode, message: string, hint?: string): ToolResult {
  const text = hint ? `${message} ${hint}` : message;
  return {
    isError: true,
    content: [{ type: "text", text }],
    structuredContent: { error: { code, message, ...(hint ? { hint } : {}) } },
  };
}

export function needsAuth(resourceMetadataUrl: string): ToolResult {
  const challenge = `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="Sign in to continue"`;
  return {
    isError: true,
    content: [{ type: "text", text: "Sign in to Self-Deprecation to continue." }],
    _meta: { "mcp/www_authenticate": challenge },
  };
}
