import { expect, it } from "vitest";
import { normalizeSearchFilters, searchArgs } from "./search-state";

it.each(["saved", "dismissed"] as const)(
  "preserves initiating %s filters in refresh and scoring arguments",
  (status) => {
    const initial = normalizeSearchFilters({
      query: "  backend  ",
      status,
      employmentType: "contract",
      remoteOnly: true,
      hideUnlistedSalary: true,
      limit: 7,
    });
    expect(initial).toEqual({
      query: "backend",
      status,
      employmentType: "contract",
      remoteOnly: true,
      hideUnlistedSalary: true,
      limit: 7,
    });
    expect(searchArgs(initial)).toEqual({
      query: "backend",
      status,
      employmentType: "contract",
      remoteOnly: true,
      hideUnlistedSalary: true,
      limit: 7,
    });
    expect(searchArgs(normalizeSearchFilters(initial))).toEqual({
      query: "backend",
      status,
      employmentType: "contract",
      remoteOnly: true,
      hideUnlistedSalary: true,
      limit: 7,
    });
  },
);
