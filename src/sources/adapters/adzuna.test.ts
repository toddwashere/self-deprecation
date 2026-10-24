import { afterEach, expect, it, vi } from "vitest";
import type { Env } from "../../env";
import { createAdzunaAdapter } from "./adzuna";

afterEach(() => vi.unstubAllGlobals());

it("queries Adzuna using explicit criteria and normalizes only disclosed annual salary", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => {
    requests.push(url);
    return new Response(
      JSON.stringify({
        results: [
          {
            id: "fixture-1",
            title: "Senior Python Engineer",
            company: { display_name: "Example" },
            location: { display_name: "Salt Lake City, Utah" },
            redirect_url: "https://www.adzuna.com/details/fixture-1",
            description: "<p>Python and Postgres</p>",
            created: "2026-10-23T12:00:00Z",
            contract_time: "full_time",
            salary_min: 150000,
            salary_max: 200000,
            salary_is_predicted: "0",
          },
          {
            id: "predicted",
            title: "Engineer",
            company: { display_name: "Example" },
            location: { display_name: "Utah" },
            redirect_url: "https://www.adzuna.com/details/predicted",
            salary_min: 100000,
            salary_is_predicted: "1",
          },
        ],
      }),
    );
  });
  const env = { ADZUNA_APP_ID: "test-id", ADZUNA_APP_KEY: "test-key" } as Env;
  const jobs = await createAdzunaAdapter({
    query: "Senior Engineer",
    location: "Salt Lake City, Utah",
  }).fetch(env, {});
  expect(requests[0].searchParams.get("what")).toBe("Senior Engineer");
  expect(requests[0].searchParams.get("where")).toBe("Salt Lake City, Utah");
  expect(jobs[0]).toMatchObject({
    source: "adzuna",
    sourceJobId: "fixture-1",
    company: "Example",
    employmentType: "full_time",
    salaryMin: 150000,
    salaryMax: 200000,
    descriptionText: "Python and Postgres",
    tags: ["postgres", "python"],
  });
  expect(jobs[1].salaryMin).toBeUndefined();
});

it("does not call Adzuna without credentials and never includes credentials in errors", async () => {
  const request = vi.fn(async () => new Response("", { status: 401 }));
  vi.stubGlobal("fetch", request);
  const adapter = createAdzunaAdapter({ query: "Engineer", location: "Utah" });
  await expect(adapter.fetch({} as Env, {})).rejects.toThrow(/credentials/i);
  expect(request).not.toHaveBeenCalled();
  await expect(
    adapter.fetch({ ADZUNA_APP_ID: "private-id", ADZUNA_APP_KEY: "private-key" } as Env, {}),
  ).rejects.toThrow("Source request failed (401)");
});
