import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bounded external fetches", () => {
  it("cancels an undeclared streaming body as soon as it exceeds maxBytes", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 10) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );

    await expect(
      fetchWithTimeout("https://example.com/feed", {
        allowedHosts: ["example.com"],
        maxBytes: 100_000,
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });

    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });
});
