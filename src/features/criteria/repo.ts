import { eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { profiles } from "../../db/schema";

export interface AvoidCriteria {
  companies: string[];
  industries: string[];
  keywords: string[];
}

export interface CriteriaRecord {
  headline: string | null;
  summary: string | null;
  targetTitles: string[];
  seniority: string | null;
  locations: string[];
  remotePref: string | null;
  salaryMin: number | null;
  hourlyMin: number | null;
  employmentTypes: string[];
  skills: string[];
  avoid: AvoidCriteria;
  bridgeMode: boolean;
  timezone: string;
  hasResume: boolean;
  resumeUpdatedAt: number | null;
  criteriaVersion: number;
  resumeText?: string;
}

export interface CriteriaPatch {
  headline?: string | null;
  summary?: string | null;
  targetTitles?: string[];
  seniority?: string | null;
  locations?: string[];
  remotePref?: string | null;
  salaryMin?: number | null;
  hourlyMin?: number | null;
  employmentTypes?: string[];
  skills?: string[];
  avoid?: Partial<AvoidCriteria>;
  bridgeMode?: boolean;
  timezone?: string;
}

export interface ResumeExtraction {
  skills?: string[];
  titles?: string[];
  seniority?: string;
  summary?: string;
}

const EMPTY_AVOID: AvoidCriteria = { companies: [], industries: [], keywords: [] };

function cleanList(values: string[], lowercase = false): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => (lowercase ? value.toLowerCase() : value)),
    ),
  ];
}

function emptyCriteria(): CriteriaRecord {
  return {
    headline: null,
    summary: null,
    targetTitles: [],
    seniority: null,
    locations: [],
    remotePref: null,
    salaryMin: null,
    hourlyMin: null,
    employmentTypes: [],
    skills: [],
    avoid: { ...EMPTY_AVOID },
    bridgeMode: false,
    timezone: "America/Denver",
    hasResume: false,
    resumeUpdatedAt: null,
    criteriaVersion: 1,
  };
}

export async function getCriteria(
  db: DB,
  userId: string,
  includeResume = false,
): Promise<CriteriaRecord> {
  const row = await db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  if (!row) return emptyCriteria();
  return {
    headline: row.headline,
    summary: row.summary,
    targetTitles: row.targetTitles,
    seniority: row.seniority,
    locations: row.locations,
    remotePref: row.remotePref,
    salaryMin: row.salaryMin,
    hourlyMin: row.hourlyMin,
    employmentTypes: row.employmentTypes,
    skills: row.skills,
    avoid: row.avoid,
    bridgeMode: row.bridgeMode,
    timezone: row.timezone,
    hasResume: Boolean(row.resumeText),
    resumeUpdatedAt: row.resumeUpdatedAt,
    criteriaVersion: row.criteriaVersion,
    ...(includeResume && row.resumeText ? { resumeText: row.resumeText } : {}),
  };
}

async function writeCriteria(
  db: DB,
  userId: string,
  patch: CriteriaPatch & { resumeText?: string; resumeUpdatedAt?: number },
  now: number,
): Promise<CriteriaRecord> {
  const current = await getCriteria(db, userId, true);
  const avoid = {
    companies: cleanList(patch.avoid?.companies ?? current.avoid.companies),
    industries: cleanList(patch.avoid?.industries ?? current.avoid.industries),
    keywords: cleanList(patch.avoid?.keywords ?? current.avoid.keywords, true),
  };
  const next = {
    headline: patch.headline === undefined ? current.headline : patch.headline,
    summary: patch.summary === undefined ? current.summary : patch.summary,
    targetTitles: cleanList(patch.targetTitles ?? current.targetTitles),
    seniority: patch.seniority === undefined ? current.seniority : patch.seniority,
    locations: cleanList(patch.locations ?? current.locations),
    remotePref: patch.remotePref === undefined ? current.remotePref : patch.remotePref,
    salaryMin: patch.salaryMin === undefined ? current.salaryMin : patch.salaryMin,
    hourlyMin: patch.hourlyMin === undefined ? current.hourlyMin : patch.hourlyMin,
    employmentTypes: cleanList(patch.employmentTypes ?? current.employmentTypes, true),
    skills: cleanList(patch.skills ?? current.skills, true),
    avoid,
    bridgeMode: patch.bridgeMode ?? current.bridgeMode,
    timezone: patch.timezone ?? current.timezone,
    resumeText: patch.resumeText === undefined ? current.resumeText : patch.resumeText,
    resumeUpdatedAt:
      patch.resumeUpdatedAt === undefined ? current.resumeUpdatedAt : patch.resumeUpdatedAt,
    criteriaVersion: current.criteriaVersion + 1,
    updatedAt: now,
  };
  await db
    .insert(profiles)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: profiles.userId, set: next });
  return getCriteria(db, userId);
}

export function updateCriteria(
  db: DB,
  userId: string,
  patch: CriteriaPatch,
  now: number,
): Promise<CriteriaRecord> {
  return writeCriteria(db, userId, patch, now);
}

export function saveResume(
  db: DB,
  userId: string,
  text: string,
  extracted: ResumeExtraction | undefined,
  now: number,
): Promise<CriteriaRecord> {
  return writeCriteria(
    db,
    userId,
    {
      resumeText: text,
      resumeUpdatedAt: now,
      ...(extracted?.skills ? { skills: extracted.skills } : {}),
      ...(extracted?.titles ? { targetTitles: extracted.titles } : {}),
      ...(extracted?.seniority ? { seniority: extracted.seniority } : {}),
      ...(extracted?.summary ? { summary: extracted.summary } : {}),
    },
    now,
  );
}
