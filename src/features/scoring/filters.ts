import type { CandidateJob, JobFilters, ScoringProfile } from "./types";

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bunited states(?: of america)?\b|\busa\b/g, "us")
    .replace(/\butah\b/g, "ut")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function evidence(job: CandidateJob): string {
  return `${job.title} ${job.company} ${job.descriptionText ?? ""} ${job.tags.join(" ")}`.toLowerCase();
}

function hasTerm(text: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped) && new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

function matchedSkills(profile: ScoringProfile, job: CandidateJob): string[] {
  const text = evidence(job);
  return [...new Set(profile.skills.map((skill) => skill.toLowerCase()))].filter((skill) =>
    hasTerm(text, skill),
  );
}

function locationMatches(profile: ScoringProfile, job: CandidateJob): boolean {
  if (!profile.locations.length) return true;
  const location = normalized(job.location ?? "");
  if (!location) return false;
  return profile.locations.some((preferred) => {
    const target = normalized(preferred);
    if (job.remote) {
      const geography = target.replace(/\bremote\b/g, "").trim();
      const usStates = new Set(
        "al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(
          " ",
        ),
      );
      const state = geography.split(" ").at(-1) ?? "";
      const region = usStates.has(state) ? "us" : geography;
      return (
        !region ||
        hasTerm(location, geography) ||
        location === "remote" ||
        location.includes("worldwide") ||
        location.includes("anywhere") ||
        hasTerm(location, region)
      );
    }
    if (target.includes("remote")) return false;
    const city = target.split(" ").slice(0, -1).join(" ") || target;
    return location.includes(target) || location.includes(city);
  });
}

export function candidateJobs(
  profile: ScoringProfile,
  jobs: CandidateJob[],
  now: number,
  filters: JobFilters = {},
): CandidateJob[] {
  return jobs
    .filter((job) => {
      if (job.postedAt !== null && job.postedAt < now - 45 * 86_400_000) return false;
      if (profile.employmentTypes.length && !profile.employmentTypes.includes(job.employmentType))
        return false;
      if (filters.employmentType && job.employmentType !== filters.employmentType) return false;
      if ((filters.remoteOnly || profile.remotePref === "remote") && job.remote !== true)
        return false;
      if (
        (profile.remotePref === "hybrid" || profile.remotePref === "onsite") &&
        job.remote !== false
      )
        return false;
      if (profile.remotePref === "onsite" && /\bhybrid\b/i.test(job.location ?? "")) return false;
      if (!locationMatches(profile, job)) return false;
      const unlisted = job.salaryMin === null && job.salaryMax === null;
      if ((filters.hideUnlistedSalary ?? profile.extra?.hideUnlistedSalary === true) && unlisted)
        return false;
      if (
        profile.salaryMin !== null &&
        job.salaryMax !== null &&
        (!job.currency || job.currency === "USD") &&
        job.salaryMax < profile.salaryMin
      )
        return false;
      const text = evidence(job);
      if (
        profile.avoid.companies.some((company) => normalized(job.company) === normalized(company))
      )
        return false;
      if (
        [...profile.avoid.industries, ...profile.avoid.keywords].some((term) => hasTerm(text, term))
      )
        return false;
      return (
        !filters.query ||
        `${text} ${job.location ?? ""}`.toLowerCase().includes(filters.query.toLowerCase())
      );
    })
    .sort((a, b) => {
      const overlap = (job: CandidateJob) =>
        matchedSkills(profile, job).length * 10 +
        profile.targetTitles.filter((title) => normalized(job.title).includes(normalized(title)))
          .length *
          5;
      return (
        overlap(b) - overlap(a) || (b.postedAt ?? 0) - (a.postedAt ?? 0) || a.id.localeCompare(b.id)
      );
    })
    .slice(0, 60);
}

export function jobReasons(profile: ScoringProfile, job: CandidateJob): string[] {
  const reasons: string[] = [];
  if (job.remote === true) reasons.push("Remote ✓");
  else if (locationMatches(profile, job) && job.location) reasons.push(job.location);
  if (job.salaryMin === null && job.salaryMax === null) reasons.push("Salary not listed");
  else if (
    job.salaryMin !== null &&
    profile.salaryMin !== null &&
    job.salaryMin >= profile.salaryMin &&
    (!job.currency || job.currency === "USD")
  )
    reasons.push(`$${Math.round(job.salaryMin / 1000)}k+`);
  const skills = matchedSkills(profile, job).slice(0, 3);
  if (skills.length) reasons.push(skills.join(", "));
  const employment = { full_time: "Full time", contract: "Contract", part_time: "Part time" }[
    job.employmentType
  ];
  if (employment) reasons.push(employment);
  return reasons;
}
