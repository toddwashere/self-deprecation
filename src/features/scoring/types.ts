import type { jobs, profiles } from "../../db/schema";

export type CandidateJob = Pick<
  typeof jobs.$inferSelect,
  | "id"
  | "source"
  | "company"
  | "title"
  | "location"
  | "remote"
  | "employmentType"
  | "salaryMin"
  | "salaryMax"
  | "currency"
  | "url"
  | "descriptionText"
  | "tags"
  | "postedAt"
  | "fetchedAt"
>;
export type ScoringProfile = Pick<
  typeof profiles.$inferSelect,
  | "targetTitles"
  | "seniority"
  | "skills"
  | "locations"
  | "remotePref"
  | "salaryMin"
  | "employmentTypes"
  | "bridgeMode"
  | "avoid"
  | "criteriaVersion"
  | "summary"
  | "headline"
  | "resumeText"
  | "extra"
>;
export interface JobFilters {
  query?: string;
  status?: string;
  employmentType?: string;
  remoteOnly?: boolean;
  hideUnlistedSalary?: boolean;
}
