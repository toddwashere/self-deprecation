import { fetchWithTimeout } from "../../lib/http";

export interface BoardOptions {
  id: string;
  boardToken: string;
  company: string;
  timeoutMs?: number;
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export async function jobJson<T>(
  url: URL,
  options: Pick<BoardOptions, "timeoutMs" | "fetcher"> = {},
  skip404 = false,
): Promise<T | null> {
  const response = options.fetcher
    ? await options.fetcher(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 5_000) })
    : await fetchWithTimeout(url, {
        allowedHosts: [url.hostname],
        timeoutMs: options.timeoutMs ?? 5_000,
        maxBytes: 2_000_000,
        redirect: "manual",
      });
  if (skip404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`Source request failed (${response.status})`);
  return response.json() as Promise<T>;
}
