import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { jobMatches, jobs, notes, profiles } from "../../db/schema";
import type { InterviewReport } from "./tools";

const companyKey = (company: string) => company.trim().toLowerCase();
const roleKey = (role?: string) => role?.trim().toLowerCase() || "general";

export async function getOwnedJob(db: DB, userId: string, jobId: string) {
  const row = await db
    .select({ job: jobs, status: jobMatches.status })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, jobId)))
    .get();
  return row ? { ...row.job, status: row.status } : null;
}

export async function getPrepContext(db: DB, userId: string, jobId?: string) {
  const job = jobId ? await getOwnedJob(db, userId, jobId) : null;
  if (jobId && !job) return null;
  const [profile, saved, prepRows, relatedNotes] = await Promise.all([
    db
      .select({
        headline: profiles.headline,
        summary: profiles.summary,
        skills: profiles.skills,
        seniority: profiles.seniority,
        targetTitles: profiles.targetTitles,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .get(),
    db
      .select({ id: jobs.id, company: jobs.company, title: jobs.title, status: jobMatches.status })
      .from(jobMatches)
      .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
      .where(
        and(
          eq(jobMatches.userId, userId),
          inArray(jobMatches.status, ["saved", "applied", "interviewing", "offer"]),
        ),
      )
      .orderBy(desc(jobMatches.updatedAt))
      .limit(50),
    db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.kind, "prep"),
          eq(notes.subjectType, "job"),
          ...(jobId ? [eq(notes.subjectId, jobId)] : []),
        ),
      )
      .orderBy(desc(notes.updatedAt))
      .limit(100),
    job
      ? db
          .select({ id: notes.id, title: notes.title, body: notes.body })
          .from(notes)
          .where(
            and(
              eq(notes.userId, userId),
              eq(notes.kind, "note"),
              or(
                and(eq(notes.subjectType, "job"), eq(notes.subjectId, job.id)),
                and(
                  eq(notes.subjectType, "company"),
                  or(
                    eq(notes.subjectId, companyKey(job.company)),
                    sql`lower(${notes.subjectLabel}) = ${companyKey(job.company)}`,
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(notes.updatedAt))
          .limit(30)
      : Promise.resolve([]),
  ]);
  // Preparation presence is independent of the bounded or selected-job note history.
  const savedPrep = saved.length
    ? await db
        .selectDistinct({ subjectId: notes.subjectId })
        .from(notes)
        .where(
          and(
            eq(notes.userId, userId),
            eq(notes.kind, "prep"),
            eq(notes.subjectType, "job"),
            inArray(
              notes.subjectId,
              saved.map((row) => row.id),
            ),
          ),
        )
    : [];
  return {
    savedJobs: saved.map((row) => ({
      ...row,
      prepStatus: savedPrep.some((prep) => prep.subjectId === row.id)
        ? ("ready" as const)
        : ("not_started" as const),
    })),
    job: job
      ? {
          id: job.id,
          company: job.company,
          title: job.title,
          descriptionText: job.descriptionText,
          status: job.status,
          tags: job.tags,
        }
      : null,
    profile: profile ?? {
      headline: null,
      summary: null,
      skills: [],
      seniority: null,
      targetTitles: [],
    },
    relatedNotes,
    prep: prepRows.map((row) => ({
      id: row.id,
      jobId: row.subjectId ?? "",
      title: row.title ?? "Interview prep",
      body: row.body ?? "",
      updatedAt: row.updatedAt,
    })),
  };
}

export async function savePrep(
  db: DB,
  userId: string,
  input: { jobId: string; noteId?: string; title: string; body: string },
  now: number,
) {
  if (!(await getOwnedJob(db, userId, input.jobId))) return null;
  const id = input.noteId ?? crypto.randomUUID();
  if (input.noteId) {
    const updated = await db
      .update(notes)
      .set({ title: input.title, body: input.body, updatedAt: now })
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.id, id),
          eq(notes.subjectType, "job"),
          eq(notes.subjectId, input.jobId),
          eq(notes.kind, "prep"),
        ),
      )
      .returning({ id: notes.id });
    if (!updated.length) return null;
  } else {
    await db.insert(notes).values({
      id,
      userId,
      subjectType: "job",
      subjectId: input.jobId,
      kind: "prep",
      title: input.title,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { id, jobId: input.jobId, title: input.title, body: input.body, updatedAt: now };
}

export async function listInterviewIntel(db: DB, userId: string, company?: string, role?: string) {
  return db
    .select({ id: notes.id, body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.kind, "interview_intel"),
        eq(notes.subjectType, "company"),
        ...(company ? [eq(notes.subjectId, companyKey(company))] : []),
        ...(role ? [eq(notes.title, roleKey(role))] : []),
      ),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(50);
}

export async function saveInterviewIntel(
  db: DB,
  userId: string,
  report: InterviewReport,
  now: number,
) {
  const scope = and(
    eq(notes.userId, userId),
    eq(notes.kind, "interview_intel"),
    eq(notes.subjectType, "company"),
    eq(notes.subjectId, companyKey(report.company)),
    eq(notes.title, roleKey(report.role)),
  );
  const existing = await db.select({ id: notes.id }).from(notes).where(scope).get();
  const id = existing?.id ?? crypto.randomUUID();
  const body = JSON.stringify(report);
  if (existing) {
    await db
      .update(notes)
      .set({ body, subjectLabel: report.company, updatedAt: now })
      .where(and(scope, eq(notes.id, id)));
  } else {
    await db.insert(notes).values({
      id,
      userId,
      subjectType: "company",
      subjectId: companyKey(report.company),
      subjectLabel: report.company,
      kind: "interview_intel",
      title: roleKey(report.role),
      body,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { id, report, updatedAt: now };
}
