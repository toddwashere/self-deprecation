import { and, asc, desc, eq, gte, isNull, lt } from "drizzle-orm";
import type { DB } from "../../db/client";
import { savedEvents } from "../../db/schema";

export type EventPatch = Partial<
  Pick<
    typeof savedEvents.$inferInsert,
    "title" | "url" | "startsAt" | "endsAt" | "venue" | "city" | "source" | "status" | "notes"
  >
>;
export interface EventFilters {
  period?: "all" | "upcoming" | "past" | "undated";
  status?: string;
  limit?: number;
}
const columns = {
  id: savedEvents.id,
  title: savedEvents.title,
  url: savedEvents.url,
  startsAt: savedEvents.startsAt,
  endsAt: savedEvents.endsAt,
  venue: savedEvents.venue,
  city: savedEvents.city,
  source: savedEvents.source,
  status: savedEvents.status,
  notes: savedEvents.notes,
  createdAt: savedEvents.createdAt,
  updatedAt: savedEvents.updatedAt,
};

export async function getEvent(db: DB, userId: string, id: string) {
  return (
    (await db
      .select(columns)
      .from(savedEvents)
      .where(and(eq(savedEvents.userId, userId), eq(savedEvents.id, id)))
      .get()) ?? null
  );
}

export async function saveEvent(
  db: DB,
  userId: string,
  event: EventPatch & { title: string },
  now: number,
) {
  const id = crypto.randomUUID();
  await db.insert(savedEvents).values({
    ...event,
    id,
    userId,
    source: event.source ?? "manual",
    createdAt: now,
    updatedAt: now,
  });
  const saved = await getEvent(db, userId, id);
  if (!saved) throw new Error("Event insert did not return a row");
  return saved;
}

export async function listEvents(db: DB, userId: string, filters: EventFilters, now: number) {
  const conditions = [eq(savedEvents.userId, userId)];
  if (filters.status) conditions.push(eq(savedEvents.status, filters.status));
  if (filters.period === "upcoming") conditions.push(gte(savedEvents.startsAt, now));
  if (filters.period === "past") conditions.push(lt(savedEvents.startsAt, now));
  if (filters.period === "undated") conditions.push(isNull(savedEvents.startsAt));
  return db
    .select(columns)
    .from(savedEvents)
    .where(and(...conditions))
    .orderBy(
      filters.period === "past" ? desc(savedEvents.startsAt) : asc(savedEvents.startsAt),
      asc(savedEvents.id),
    )
    .limit(filters.limit ?? 100);
}

export async function updateEvent(
  db: DB,
  userId: string,
  id: string,
  patch: EventPatch,
  now: number,
) {
  const rows = await db
    .update(savedEvents)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(savedEvents.userId, userId), eq(savedEvents.id, id)))
    .returning(columns);
  return rows[0] ?? null;
}

export async function removeEvent(db: DB, userId: string, id: string) {
  const rows = await db
    .delete(savedEvents)
    .where(and(eq(savedEvents.userId, userId), eq(savedEvents.id, id)))
    .returning({ id: savedEvents.id });
  return rows.length;
}
