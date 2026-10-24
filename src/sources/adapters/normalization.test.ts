import { describe, expect, it } from "vitest";
import { cleanDescription, normalizeEmployment, selectJobs } from "./normalization";

describe("source normalization", () => {
  it("decodes escaped HTML before stripping, removes scripts, and caps UTF-8 at 8 KB", () => {
    const text = cleanDescription(
      "&lt;p&gt;TypeScript &amp;amp; Python&lt;/p&gt;<script>secret()</script><style>bad</style><p>&#x1F600; " +
        "é".repeat(9_000) +
        "</p>",
    );
    expect(text).toMatch(/^TypeScript & Python\n😀 /);
    expect(text).not.toMatch(/secret|bad|<|>/);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(8_000);
    expect(() => cleanDescription("&#999999999;")).not.toThrow();
  });

  it("keeps unknown employment unknown and bounds limits after since filtering", () => {
    expect(normalizeEmployment("FullTime")).toBe("full_time");
    expect(normalizeEmployment("Contractor")).toBe("contract");
    expect(normalizeEmployment("Part-time")).toBe("part_time");
    expect(normalizeEmployment(undefined)).toBe("unknown");
    const jobs = [1, 2, 3].map((postedAt) => ({
      source: "fixture",
      sourceJobId: String(postedAt),
      title: "Engineer",
      company: "Example",
      employmentType: "unknown" as const,
      url: "https://example.com",
      postedAt,
    }));
    expect(selectJobs(jobs, { since: 2, limit: 1 }).map((job) => job.sourceJobId)).toEqual(["2"]);
    expect(selectJobs(jobs, { limit: 0 })).toEqual([]);
  });
});
