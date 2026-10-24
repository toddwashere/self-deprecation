import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  contacts,
  jobMatches,
  jobs,
  newsItems,
  profiles,
  savedEvents,
  userState,
} from "../../db/schema";

const seenKey = "brief.last_seen_at";
async function bounded<T>(read: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Brief read timed out")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readContext(db: DB, userId: string) {
  const [profile, states] = await Promise.all([
    db
      .select({
        criteriaVersion: profiles.criteriaVersion,
        timezone: profiles.timezone,
        targetTitles: profiles.targetTitles,
        skills: profiles.skills,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .get(),
    db
      .select({ key: userState.key, value: userState.value })
      .from(userState)
      .where(
        and(
          eq(userState.userId, userId),
          sql`(${userState.key} = ${seenKey} or ${userState.key} like 'task.jobs-v%')`,
        ),
      ),
  ]);
  const value = states.find((row) => row.key === seenKey)?.value;
  const lastSeenAt =
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const taskId = `jobs-v${profile?.criteriaVersion ?? 1}`;
  return { profile, lastSeenAt, task: states.find((row) => row.key === `task.${taskId}`)?.value };
}

async function readMatches(
  db: DB,
  userId: string,
  criteriaVersion: number,
  since: number,
  now: number,
  contract = false,
) {
  const changedAt = sql<number>`coalesce(${jobMatches.scoredAt}, ${jobMatches.updatedAt})`;
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      url: jobs.url,
      location: jobs.location,
      employmentType: jobs.employmentType,
      fitScore: jobMatches.fitScore,
      reasons: jobMatches.reasons,
      scoredAt: jobMatches.scoredAt,
    })
    .from(jobMatches)
    .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
    .where(
      and(
        eq(jobMatches.userId, userId),
        eq(jobMatches.criteriaVersion, criteriaVersion),
        eq(jobMatches.status, "new"),
        gt(changedAt, since),
        lte(changedAt, now),
        contract ? eq(jobs.employmentType, "contract") : undefined,
      ),
    )
    .orderBy(desc(jobMatches.fitScore), desc(changedAt), asc(jobs.id))
    .limit(5);
}
async function readEvents(db: DB, userId: string, now: number) {
  return db
    .select({
      id: savedEvents.id,
      title: savedEvents.title,
      url: savedEvents.url,
      startsAt: savedEvents.startsAt,
      city: savedEvents.city,
      venue: savedEvents.venue,
      status: savedEvents.status,
    })
    .from(savedEvents)
    .where(
      and(
        eq(savedEvents.userId, userId),
        gte(savedEvents.startsAt, now),
        lte(savedEvents.startsAt, now + 30 * 86_400_000),
        inArray(savedEvents.status, ["interested", "going"]),
      ),
    )
    .orderBy(asc(savedEvents.startsAt), asc(savedEvents.id))
    .limit(5);
}
async function readFollowUps(db: DB, userId: string, now: number) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      company: contacts.company,
      followUpAt: contacts.followUpAt,
    })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), lte(contacts.followUpAt, now)))
    .orderBy(asc(contacts.followUpAt), asc(contacts.id))
    .limit(5);
}
async function readHeadlines(db: DB, since: number, now: number) {
  const date = sql<number>`coalesce(${newsItems.publishedAt}, ${newsItems.fetchedAt})`;
  return db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      url: newsItems.url,
      source: newsItems.source,
      publishedAt: newsItems.publishedAt,
      fetchedAt: newsItems.fetchedAt,
    })
    .from(newsItems)
    .where(and(gt(date, since), lte(date, now)))
    .orderBy(desc(date), asc(newsItems.id))
    .limit(5);
}

export async function readBrief(db: DB, userId: string, now: number) {
  const { profile, lastSeenAt, task } = await bounded(readContext(db, userId), 1_500);
  const since = lastSeenAt ?? -1;
  const version = profile?.criteriaVersion ?? -1;
  const names = ["matches", "contractLeads", "events", "followUps", "headlines"] as const;
  const sections = await Promise.allSettled([
    bounded(readMatches(db, userId, version, since, now), 4_500),
    bounded(readMatches(db, userId, version, since, now, true), 4_500),
    bounded(readEvents(db, userId, now), 4_500),
    bounded(readFollowUps(db, userId, now), 4_500),
    bounded(readHeadlines(db, since, now), 4_500),
  ] as const);
  return {
    asOf: now,
    lastSeenAt,
    timezone: profile?.timezone ?? "America/Denver",
    needsCriteria: !profile || !(profile.targetTitles.length || profile.skills.length),
    matches: sections[0].status === "fulfilled" ? sections[0].value : [],
    contractLeads: sections[1].status === "fulfilled" ? sections[1].value : [],
    events: sections[2].status === "fulfilled" ? sections[2].value : [],
    followUps: sections[3].status === "fulfilled" ? sections[3].value : [],
    headlines: sections[4].status === "fulfilled" ? sections[4].value : [],
    unavailable: names.filter((_, index) => sections[index].status === "rejected"),
    task,
  };
}

export async function markBriefSeen(db: DB, userId: string, asOf: number, now: number) {
  await bounded(
    db
      .insert(userState)
      .values({ userId, key: seenKey, value: asOf, updatedAt: now })
      .onConflictDoUpdate({
        target: [userState.userId, userState.key],
        set: {
          value: sql`max(coalesce(cast(${userState.value} as integer), 0), ${asOf})`,
          updatedAt: now,
        },
        setWhere: and(eq(userState.userId, userId), eq(userState.key, seenKey)),
      }),
    5_000,
  );
  const row = await bounded(
    db
      .select({ value: userState.value })
      .from(userState)
      .where(and(eq(userState.userId, userId), eq(userState.key, seenKey)))
      .get(),
    1_000,
  );
  return row?.value as number;
}
