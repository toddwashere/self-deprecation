import { expect, it } from "vitest";
import type { Env } from "../../env";
import { seedJobsAdapter } from "./seed";
import { snapshotJob } from "./snapshot";

it("builds public fallback text from metadata and skills only, excluding all original descriptions", () => {
  const snapshot = snapshotJob(
    {
      source: "greenhouse_example",
      sourceJobId: "1",
      company: "Example",
      title: "Senior Engineer",
      location: "Utah",
      employmentType: "full_time",
      url: "https://example.com/jobs/1",
      descriptionText: "Contact person@example.com or +1 (555) 123-4567. Build TypeScript.",
      tags: ["typescript", "person@example.com"],
    },
    123,
  );
  expect(snapshot.descriptionText).toBe("Senior Engineer at Example. Utah. Skills: typescript.");
  expect(JSON.stringify(snapshot)).not.toMatch(/@|555|Contact/);
  expect(snapshot).toMatchObject({
    jobId: "greenhouse_example:senior:1",
    jobText: snapshot.descriptionText,
    snapshotCapturedAt: 123,
  });
});

it("loads sixty fallback jobs with original identities and a snapshot provenance tag", async () => {
  const jobs = await seedJobsAdapter.fetch({} as Env, { limit: 100 });
  expect(jobs.length).toBeGreaterThanOrEqual(60);
  expect(
    jobs.every(
      (job) =>
        job.source !== "seed" && job.tags?.includes("snapshot") && job.url.startsWith("https://"),
    ),
  ).toBe(true);
});
