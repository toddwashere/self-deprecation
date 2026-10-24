import { AppError } from "./errors";

interface FetchOptions extends RequestInit {
  allowedHosts: readonly string[];
  timeoutMs?: number;
  maxBytes?: number;
}

export async function fetchWithTimeout(
  url: string | URL,
  options: FetchOptions,
): Promise<Response> {
  const target = new URL(url);
  if (!options.allowedHosts.includes(target.hostname)) {
    throw new AppError("HOST_NOT_ALLOWED", `Host is not allowed: ${target.hostname}`, 400);
  }
  const { allowedHosts: _, timeoutMs = 8_000, maxBytes = 1_000_000, ...requestInit } = options;
  const response = await fetch(target, { ...requestInit, signal: AbortSignal.timeout(timeoutMs) });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new AppError("RESPONSE_TOO_LARGE", "External response exceeded the size limit", 502);
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > maxBytes) {
    throw new AppError("RESPONSE_TOO_LARGE", "External response exceeded the size limit", 502);
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function fetchJsonWithTimeout<T>(
  url: string | URL,
  options: FetchOptions,
): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok)
    throw new AppError("UPSTREAM_ERROR", `External request failed (${response.status})`, 502);
  return response.json<T>();
}
