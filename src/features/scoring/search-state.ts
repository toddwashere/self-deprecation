import type { JobSearchFilters } from "../jobs/tools";
import type { JobFilters } from "./types";

export function normalizeSearchFilters(
  filters: JobFilters & { limit?: number } = {},
): JobSearchFilters {
  const status =
    (["new", "saved", "applied", "interviewing", "offer", "rejected", "dismissed"] as const).find(
      (value) => value === filters.status,
    ) ?? "";
  const employmentType =
    (["full_time", "contract", "part_time", "unknown"] as const).find(
      (value) => value === filters.employmentType,
    ) ?? "";
  return {
    query: filters.query?.trim() ?? "",
    status,
    employmentType,
    remoteOnly: filters.remoteOnly ?? false,
    hideUnlistedSalary: filters.hideUnlistedSalary ?? false,
    limit:
      typeof filters.limit === "number" && Number.isFinite(filters.limit)
        ? Math.min(60, Math.max(1, Math.trunc(filters.limit)))
        : 60,
  };
}

export function searchArgs(filters: JobSearchFilters) {
  return {
    query: filters.query || undefined,
    status: filters.status || undefined,
    employmentType: filters.employmentType || undefined,
    remoteOnly: filters.remoteOnly,
    hideUnlistedSalary: filters.hideUnlistedSalary,
    limit: filters.limit,
  };
}
