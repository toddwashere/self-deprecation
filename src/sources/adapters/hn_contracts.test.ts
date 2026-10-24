import { describe, expect, it } from "vitest";
import type { Env } from "../../env";
import freelanceFixture from "./fixtures/hn_freelance.json";
import hiringFixture from "./fixtures/hn_hiring.json";
import { parseHnComment } from "./hn_common";
import { createHnFreelanceAdapter } from "./hn_freelance";
import { createHnHiringAdapter } from "./hn_hiring";

const env = {} as Env;

function recorded(search: unknown, item: unknown) {
  return async (input: string | URL) => {
    const url = new URL(input);
    return Response.json(url.pathname.includes("/items/") ? item : search);
  };
}

describe("HN contract sources", () => {
  it("parses a direct Who-is-hiring contract post and excludes replies and full-time posts", async () => {
    const adapter = createHnHiringAdapter({
      fetcher: recorded(hiringFixture.search, hiringFixture.item),
    });
    const jobs = await adapter.fetch(env, { limit: 10 });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "hn_hiring",
      sourceJobId: "5001",
      company: "Migration Labs",
      title: "Senior TypeScript Engineer",
      location: "REMOTE (US)",
      remote: true,
      employmentType: "contract",
      url: "https://news.ycombinator.com/item?id=5001",
      descriptionText: expect.stringContaining("Build TypeScript & Postgres services."),
      tags: expect.arrayContaining(["typescript", "postgres"]),
      postedAt: 1790867000000,
    });
    expect(jobs.some((job) => job.sourceJobId === "5999")).toBe(false);
    expect(jobs.some((job) => job.sourceJobId === "5002")).toBe(false);
  });

  it("keeps only employer-side Seeking Freelancer posts and preserves their real age", async () => {
    const adapter = createHnFreelanceAdapter({
      fetcher: recorded(freelanceFixture.search, freelanceFixture.item),
    });
    const jobs = await adapter.fetch(env, { limit: 10 });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "hn_freelance",
      sourceJobId: "4001",
      company: "Human Systems",
      title: "AI Product Engineer",
      location: "Remote US",
      remote: true,
      employmentType: "contract",
      postedAt: 1759331000000,
      tags: expect.arrayContaining(["python", "react"]),
    });
    expect(jobs.some((job) => job.sourceJobId === "4002")).toBe(false);
  });

  it("uses first-line fields after a thread heading and strips bounded HTML", () => {
    const job = parseHnComment(
      {
        id: 7,
        created_at_i: 10,
        text: "SEEKING FREELANCER<br>Example Co | Staff Engineer | Remote<p>Build <b>useful</b> things.</p>",
      },
      "hn_freelance",
    );
    expect(job).toMatchObject({
      company: "Example Co",
      title: "Staff Engineer",
      location: "Remote",
      descriptionText:
        "SEEKING FREELANCER\nExample Co | Staff Engineer | Remote\nBuild useful things.",
    });
  });

  it("applies since and limit after parsing and returns empty when no thread exists", async () => {
    const fetcher = recorded({ hits: [] }, freelanceFixture.item);
    expect(await createHnFreelanceAdapter({ fetcher }).fetch(env, {})).toEqual([]);

    const adapter = createHnHiringAdapter({
      fetcher: recorded(hiringFixture.search, hiringFixture.item),
    });
    expect(await adapter.fetch(env, { limit: 0 })).toEqual([]);
    expect(await adapter.fetch(env, { since: 1790867000001 })).toEqual([]);
  });
});
