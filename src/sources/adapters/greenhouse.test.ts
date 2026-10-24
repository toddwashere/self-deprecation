import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { createGreenhouseAdapter } from "./greenhouse";

const fixture = {
  jobs: [
    {
      id: 123,
      title: "Senior AI Platform Engineer",
      updated_at: "2026-10-23T12:00:00Z",
      location: { name: "Remote - US" },
      absolute_url: "https://job-boards.greenhouse.io/example/jobs/123",
      content: "<p>Build reliable <strong>TypeScript</strong> and Postgres systems.</p>",
    },
  ],
};

describe("Greenhouse adapter", () => {
  it("normalizes the official Job Board response shape", async () => {
    const adapter = createGreenhouseAdapter({
      id: "greenhouse_fixture",
      boardToken: "example",
      company: "Example AI",
      fetcher: async () => new Response(JSON.stringify(fixture), { status: 200 }),
      includeContent: true,
    });

    const jobs = await adapter.fetch({} as Env, { limit: 10 });

    expect(jobs).toEqual([
      expect.objectContaining({
        source: "greenhouse_fixture",
        sourceJobId: "123",
        company: "Example AI",
        title: "Senior AI Platform Engineer",
        location: "Remote - US",
        remote: true,
        employmentType: "full_time",
        url: "https://job-boards.greenhouse.io/example/jobs/123",
        descriptionText: "Build reliable TypeScript and Postgres systems.",
        tags: expect.arrayContaining(["typescript", "postgres", "ai"]),
      }),
    ]);
  });
});
