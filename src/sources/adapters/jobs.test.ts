import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../env";
import { createAshbyAdapter } from "./ashby";
import ashbyFixture from "./fixtures/ashby.json";
import greenhouseFixture from "./fixtures/greenhouse.json";
import leverFixture from "./fixtures/lever.json";
import remoteokFixture from "./fixtures/remoteok.json";
import remotiveFixture from "./fixtures/remotive.json";
import { createGreenhouseAdapter } from "./greenhouse";
import { createLeverAdapter } from "./lever";
import { remoteOkAdapter } from "./remoteok";
import { remotiveAdapter } from "./remotive";

const env = {} as Env;
afterEach(() => vi.unstubAllGlobals());

function response(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status })),
  );
}

describe("recorded public response shapes (description text synthetic)", () => {
  it("Greenhouse decodes escaped HTML and filters since before limiting", async () => {
    response(greenhouseFixture);
    const adapter = createGreenhouseAdapter({
      id: "greenhouse_lucidsoftware",
      boardToken: "lucidsoftware",
      company: "Lucid Software",
      includeContent: true,
    });
    const jobs = await adapter.fetch(env, { limit: 1 });
    expect(jobs[0]).toMatchObject({
      company: "Lucid Software",
      descriptionText: "Build TypeScript & Python services.",
      tags: expect.arrayContaining(["typescript", "python"]),
    });
    expect(await adapter.fetch(env, { since: Date.now() + 86400000 })).toEqual([]);
    expect(await adapter.fetch(env, { limit: 0 })).toEqual([]);
  });

  it("Lever combines plain description and HTML list sections", async () => {
    response(leverFixture);
    const adapter = createLeverAdapter({
      id: "lever_wealthfront",
      boardToken: "wealthfront",
      company: "Wealthfront",
    });
    const jobs = await adapter.fetch(env, { limit: 1 });
    expect(jobs[0]).toMatchObject({
      source: "lever_wealthfront",
      sourceJobId: leverFixture[0].id,
      company: "Wealthfront",
      title: leverFixture[0].text,
      url: leverFixture[0].hostedUrl,
      tags: expect.arrayContaining(["python", "typescript", "react", "postgres"]),
    });
    expect(jobs[0].descriptionText).toContain("TypeScript and React");
  });

  it("Ashby preserves listed jobs and annual base salary without treating hybrid as remote", async () => {
    const job = {
      ...ashbyFixture.jobs[0],
      workplaceType: "Hybrid",
      isRemote: true,
      employmentType: "PartTime",
      compensation: {
        summaryComponents: [
          {
            compensationType: "Salary",
            interval: "1 YEAR",
            currencyCode: "USD",
            minValue: 150000,
            maxValue: 200000,
          },
          { compensationType: "EquityPercentage", interval: "NONE", minValue: 0.5, maxValue: 1 },
        ],
      },
    };
    response({ jobs: [{ ...job, isListed: false }, job] });
    const jobs = await createAshbyAdapter({
      id: "ashby_linear",
      boardToken: "linear",
      company: "Linear",
    }).fetch(env, { limit: 2 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceJobId: job.id,
      company: "Linear",
      employmentType: "part_time",
      remote: false,
      salaryMin: 150000,
      salaryMax: 200000,
      currency: "USD",
      tags: expect.arrayContaining(["typescript", "react"]),
    });
    expect(jobs[0].location).toContain("Hybrid");
  });

  it("Remote OK skips the legal notice and preserves the attributed listing link", async () => {
    response(remoteokFixture);
    const jobs = await remoteOkAdapter.fetch(env, { limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "remoteok",
      sourceJobId: String(remoteokFixture[1].id),
      url: remoteokFixture[1].url,
      remote: true,
      descriptionText: "Build TypeScript and Python services.",
    });
    expect(jobs[0].salaryMin).toBeUndefined();
  });

  it("Remotive uses the delayed source URL and required candidate geography", async () => {
    response(remotiveFixture);
    const jobs = await remotiveAdapter.fetch(env, { limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "remotive",
      sourceJobId: String(remotiveFixture.jobs[0].id),
      company: remotiveFixture.jobs[0].company_name,
      title: remotiveFixture.jobs[0].title,
      url: remotiveFixture.jobs[0].url,
      location: remotiveFixture.jobs[0].candidate_required_location,
      remote: true,
      tags: expect.arrayContaining(["typescript", "python"]),
    });
  });

  it("skips missing ATS boards, fails malformed responses, and enforces HTTP errors", async () => {
    const adapters = [createGreenhouseAdapter, createLeverAdapter, createAshbyAdapter].map(
      (create) => create({ id: "fixture", boardToken: "missing", company: "Example" }),
    );
    response({}, 404);
    for (const adapter of adapters) expect(await adapter.fetch(env, {})).toEqual([]);
    response({ invalid: true });
    for (const adapter of adapters) await expect(adapter.fetch(env, {})).rejects.toThrow();
    response({}, 503);
    await expect(remoteOkAdapter.fetch(env, {})).rejects.toThrow(/503/);
    await expect(remotiveAdapter.fetch(env, {})).rejects.toThrow(/503/);
  });
});

it("refuses oversized boards before parsing their content", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response("{}", { headers: { "content-length": "2000001" } }),
  );
  await expect(
    createAshbyAdapter({ id: "oversized", boardToken: "large", company: "Large" }).fetch(env, {}),
  ).rejects.toThrow(/size limit/);
});

it("uses the Workers-supported manual redirect mode and rejects redirects", async () => {
  let mode: RequestRedirect | undefined;
  vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
    mode = init.redirect;
    return new Response(JSON.stringify({ jobs: [] }));
  });
  const adapter = createGreenhouseAdapter({
    id: "fixture",
    boardToken: "example",
    company: "Example",
  });
  await adapter.fetch(env, {});
  expect(mode).toBe("manual");
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response("", { status: 302, headers: { location: "https://untrusted.example/jobs" } }),
  );
  await expect(adapter.fetch(env, {})).rejects.toThrow(/302/);
});
