import { and, count, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  apiUsage,
  contacts,
  jobMatches,
  ladderAssessments,
  ladderQuests,
  notes,
  profiles,
  savedEvents,
  userState,
  users,
} from "../../db/schema";

export interface DemoData {
  profile: {
    headline: string;
    summary: string;
    targetTitles: string[];
    seniority: string;
    locations: string[];
    remotePref: string;
    salaryMin: number;
    hourlyMin: number;
    employmentTypes: string[];
    skills: string[];
    timezone: string;
  };
  contacts: Array<{
    id: string;
    name: string;
    company?: string;
    title?: string;
    whereMet?: string;
    tags: string[];
  }>;
  notes: Array<{
    id: string;
    subjectType: string;
    subjectLabel?: string;
    title?: string;
    body?: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    url?: string;
    city?: string;
    source: string;
    status: string;
  }>;
}

export async function getTaskState(db: DB, userId: string, taskId: string) {
  const row = await db
    .select({ value: userState.value })
    .from(userState)
    .where(and(eq(userState.userId, userId), eq(userState.key, `task.${taskId}`)))
    .get();
  return row?.value;
}

export async function getDashboardCounts(db: DB, userId: string) {
  const [matches, people, noteRows, events] = await Promise.all([
    db.select({ value: count() }).from(jobMatches).where(eq(jobMatches.userId, userId)).get(),
    db.select({ value: count() }).from(contacts).where(eq(contacts.userId, userId)).get(),
    db.select({ value: count() }).from(notes).where(eq(notes.userId, userId)).get(),
    db.select({ value: count() }).from(savedEvents).where(eq(savedEvents.userId, userId)).get(),
  ]);
  return {
    jobs: matches?.value ?? 0,
    contacts: people?.value ?? 0,
    notes: noteRows?.value ?? 0,
    events: events?.value ?? 0,
  };
}

export async function hasJobCriteria(db: DB, userId: string): Promise<boolean> {
  const row = await db
    .select({ targetTitles: profiles.targetTitles, skills: profiles.skills })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();
  return Boolean(row && (row.targetTitles.length > 0 || row.skills.length > 0));
}

export async function resetUserData(db: DB, userId: string, now: number): Promise<void> {
  await db
    .insert(users)
    .values({ id: userId, displayName: "Local Developer", createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: users.id });
  const existing = await db
    .select({ criteriaVersion: profiles.criteriaVersion })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .get();
  await db.delete(jobMatches).where(eq(jobMatches.userId, userId));
  await db.delete(contacts).where(eq(contacts.userId, userId));
  await db.delete(notes).where(eq(notes.userId, userId));
  await db.delete(savedEvents).where(eq(savedEvents.userId, userId));
  await db.delete(userState).where(eq(userState.userId, userId));
  await db.delete(ladderAssessments).where(eq(ladderAssessments.userId, userId));
  await db.delete(ladderQuests).where(eq(ladderQuests.userId, userId));
  await db.delete(apiUsage).where(eq(apiUsage.userId, userId));

  await db
    .insert(profiles)
    .values({ userId, criteriaVersion: (existing?.criteriaVersion ?? 0) + 1, updatedAt: now })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
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
        avoid: { companies: [], industries: [], keywords: [] },
        bridgeMode: false,
        resumeText: null,
        resumeUpdatedAt: null,
        extra: null,
        criteriaVersion: (existing?.criteriaVersion ?? 0) + 1,
        updatedAt: now,
      },
    });
}

export async function loadDemoData(db: DB, userId: string, demo: DemoData, now: number) {
  await resetUserData(db, userId, now);
  await db
    .update(profiles)
    .set({ ...demo.profile, updatedAt: now })
    .where(eq(profiles.userId, userId));
  if (demo.contacts.length) {
    await db.insert(contacts).values(
      demo.contacts.map((contact) => ({
        ...contact,
        userId,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  if (demo.notes.length) {
    await db.insert(notes).values(
      demo.notes.map((note) => ({
        ...note,
        userId,
        kind: "note",
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  if (demo.events.length) {
    await db
      .insert(savedEvents)
      .values(demo.events.map((event) => ({ ...event, userId, createdAt: now, updatedAt: now })));
  }
  return { contacts: demo.contacts.length, notes: demo.notes.length, events: demo.events.length };
}
