import { describe, expect, it } from "vitest";
import { candidateJobs, jobReasons } from "./filters";
import type { CandidateJob, ScoringProfile } from "./types";

const now = Date.UTC(2026, 9, 24);
const profile: ScoringProfile = {
  targetTitles: ["Senior Software Engineer"],
  seniority: "senior",
  skills: ["typescript", "postgres", "react", "c++"],
  locations: ["Salt Lake City, UT", "Remote US"],
  remotePref: "remote",
  salaryMin: 175000,
  employmentTypes: ["full_time"],
  avoid: { companies: ["Avoid Inc"], industries: ["gambling"], keywords: ["clearance"] },
  criteriaVersion: 1,
  summary: null,
  headline: null,
  resumeText: null,
  extra: null,
};
const job: CandidateJob = {
  id: "good",
  source: "seed",
  company: "Example",
  title: "Senior Software Engineer",
  location: "Remote US",
  remote: true,
  employmentType: "full_time",
  salaryMin: 180000,
  salaryMax: 210000,
  currency: "USD",
  url: "https://example.com/job",
  descriptionText: "TypeScript and Postgres services",
  tags: ["typescript", "postgres"],
  postedAt: now,
  fetchedAt: now,
};

describe("T6 candidate filtering", () => {
  it.each([
    ["listed maximum below floor", { salaryMax: 174999, salaryMin: 150000 }, {}, false],
    ["listed range crosses floor", { salaryMax: 175000, salaryMin: 150000 }, {}, true],
    ["listed minimum without known ceiling", { salaryMax: null, salaryMin: 150000 }, {}, true],
    ["unlisted retained", { salaryMax: null, salaryMin: null }, {}, true],
    [
      "unlisted hidden by toggle",
      { salaryMax: null, salaryMin: null },
      { hideUnlistedSalary: true },
      false,
    ],
    ["non USD not compared", { salaryMax: 150000, salaryMin: 140000, currency: "EUR" }, {}, true],
    ["remote matches United States alias", { location: "United States" }, {}, true],
    ["remote matches USA alias", { location: "USA" }, {}, true],
    ["remote excludes Australia substring", { location: "Remote Australia" }, {}, false],
    ["remote excludes other regions", { location: "Remote Europe" }, {}, false],
    ["remote excludes onsite", { remote: false, location: "Salt Lake City, UT" }, {}, false],
    ["remote unknown excluded", { remote: null, location: null }, {}, false],
    ["company avoided", { company: "AVOID INC" }, {}, false],
    ["industry avoided", { descriptionText: "A gambling platform" }, {}, false],
    ["keyword avoided", { descriptionText: "Requires clearance" }, {}, false],
    ["employment mismatch", { employmentType: "contract" }, {}, false],
    ["older than 45 days", { postedAt: now - 46 * 86400000 }, {}, false],
    ["unknown posting date", { postedAt: null }, {}, true],
  ] as const)("%s", (_label, change, filters, kept) => {
    expect(candidateJobs(profile, [{ ...job, ...change }], now, filters).length).toBe(kept ? 1 : 0);
  });

  it.each([
    ["hybrid", false, "Salt Lake City, Utah", true],
    ["hybrid", false, "New York, NY", false],
    ["hybrid", true, "Remote US", false],
    ["onsite", false, "Salt Lake City, UT", true],
    ["onsite", false, "Salt Lake City, UT (Hybrid)", false],
    ["any", false, "New York, NY", false],
    ["any", true, "Remote US", true],
  ] as const)("%s remote=%s location=%s", (remotePref, remote, location, kept) => {
    expect(
      candidateJobs({ ...profile, remotePref }, [{ ...job, remote, location }], now).length,
    ).toBe(kept ? 1 : 0);
  });

  it("ranks overlap ahead of recency and limits the candidate pool to sixty", () => {
    const low = { ...job, id: "low", title: "Designer", tags: [], descriptionText: "Illustration" };
    const high = { ...job, id: "high", postedAt: now - 86400000 };
    const many = Array.from({ length: 70 }, (_, i) => ({ ...low, id: `low-${i}` }));
    const result = candidateJobs(profile, [...many, high], now);
    expect(result).toHaveLength(60);
    expect(result[0].id).toBe("high");
  });

  it("derives truthful chips from evidence and labels unknown salary", () => {
    expect(jobReasons(profile, job)).toEqual([
      "Remote ✓",
      "$180k+",
      "typescript, postgres",
      "Full time",
    ]);
    expect(
      jobReasons(profile, {
        ...job,
        salaryMin: null,
        salaryMax: null,
        tags: [],
        descriptionText: "C++ services",
      }),
    ).toEqual(["Remote ✓", "Salary not listed", "c++", "Full time"]);
    expect(jobReasons(profile, { ...job, salaryMin: 150000, salaryMax: 210000 })).not.toContain(
      "$175k+",
    );
  });
});

it("matches remote geography independently of the work-mode preference", () => {
  const localRemote = { ...profile, remotePref: "remote", locations: ["Salt Lake City, UT"] };
  expect(candidateJobs(localRemote, [job], now).map((item) => item.id)).toEqual(["good"]);
  expect(candidateJobs({ ...localRemote, remotePref: "any" }, [job], now)).toHaveLength(1);
  expect(candidateJobs(localRemote, [{ ...job, location: "Remote Europe" }], now)).toHaveLength(0);
  expect(
    candidateJobs(localRemote, [{ ...job, remote: false, location: "Salt Lake City, UT" }], now),
  ).toHaveLength(0);
});

it.each([
  ["Seattle, Washington", "Seattle, WA"],
  ["City, Alabama", "City, AL"],
  ["City, Alaska", "City, AK"],
  ["City, Arizona", "City, AZ"],
  ["City, Arkansas", "City, AR"],
  ["City, California", "City, CA"],
  ["City, Colorado", "City, CO"],
  ["City, Connecticut", "City, CT"],
  ["City, Delaware", "City, DE"],
  ["City, Florida", "City, FL"],
  ["City, Georgia", "City, GA"],
  ["City, Hawaii", "City, HI"],
  ["City, Idaho", "City, ID"],
  ["City, Illinois", "City, IL"],
  ["City, Indiana", "City, IN"],
  ["City, Iowa", "City, IA"],
  ["City, Kansas", "City, KS"],
  ["City, Kentucky", "City, KY"],
  ["City, Louisiana", "City, LA"],
  ["City, Maine", "City, ME"],
  ["City, Maryland", "City, MD"],
  ["City, Massachusetts", "City, MA"],
  ["City, Michigan", "City, MI"],
  ["City, Minnesota", "City, MN"],
  ["City, Mississippi", "City, MS"],
  ["City, Missouri", "City, MO"],
  ["City, Montana", "City, MT"],
  ["City, Nebraska", "City, NE"],
  ["City, Nevada", "City, NV"],
  ["City, New Hampshire", "City, NH"],
  ["City, New Jersey", "City, NJ"],
  ["City, New Mexico", "City, NM"],
  ["City, New York", "City, NY"],
  ["City, North Carolina", "City, NC"],
  ["City, North Dakota", "City, ND"],
  ["City, Ohio", "City, OH"],
  ["City, Oklahoma", "City, OK"],
  ["City, Oregon", "City, OR"],
  ["City, Pennsylvania", "City, PA"],
  ["City, Rhode Island", "City, RI"],
  ["City, South Carolina", "City, SC"],
  ["City, South Dakota", "City, SD"],
  ["City, Tennessee", "City, TN"],
  ["City, Texas", "City, TX"],
  ["City, Utah", "City, UT"],
  ["City, Vermont", "City, VT"],
  ["City, Virginia", "City, VA"],
  ["City, West Virginia", "City, WV"],
  ["City, Wisconsin", "City, WI"],
  ["City, Wyoming", "City, WY"],
  ["District of Columbia", "DC"],
])("accepts remote US roles for %s and %s consistently", (fullName, abbreviation) => {
  for (const location of [fullName, abbreviation]) {
    const local = { ...profile, locations: [location] };
    expect(candidateJobs(local, [job], now).map((item) => item.id)).toEqual(["good"]);
    expect(candidateJobs(local, [{ ...job, location: "Remote Europe" }], now)).toHaveLength(0);
  }
});
