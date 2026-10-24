import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { learningEntries } from "../../db/schema";

export type LearningPatch = Partial<
  Pick<
    typeof learningEntries.$inferInsert,
    | "title"
    | "kind"
    | "body"
    | "sourceUrl"
    | "sourceTitle"
    | "author"
    | "occurredAt"
    | "tags"
    | "takeaways"
    | "followUpQuestions"
    | "nextActions"
    | "pinned"
    | "archived"
  >
>;
export interface LearningFilters {
  kind?: string;
  tag?: string;
  archived?: boolean;
  query?: string;
  limit?: number;
  offset?: number;
}
const columns = {
  id: learningEntries.id,
  title: learningEntries.title,
  kind: learningEntries.kind,
  body: learningEntries.body,
  sourceUrl: learningEntries.sourceUrl,
  sourceTitle: learningEntries.sourceTitle,
  author: learningEntries.author,
  occurredAt: learningEntries.occurredAt,
  tags: learningEntries.tags,
  takeaways: learningEntries.takeaways,
  followUpQuestions: learningEntries.followUpQuestions,
  nextActions: learningEntries.nextActions,
  pinned: learningEntries.pinned,
  archived: learningEntries.archived,
  createdAt: learningEntries.createdAt,
  updatedAt: learningEntries.updatedAt,
};

export async function getLearningEntry(db: DB, userId: string, id: string) {
  return (
    (await db
      .select(columns)
      .from(learningEntries)
      .where(and(eq(learningEntries.userId, userId), eq(learningEntries.id, id)))
      .get()) ?? null
  );
}
export async function saveLearningEntry(
  db: DB,
  userId: string,
  entry: LearningPatch & { title: string },
  now: number,
) {
  const id = crypto.randomUUID();
  await db.insert(learningEntries).values({ ...entry, id, userId, createdAt: now, updatedAt: now });
  const saved = await getLearningEntry(db, userId, id);
  if (!saved) throw new Error("Learning insert returned no row");
  return saved;
}
export async function updateLearningEntry(
  db: DB,
  userId: string,
  id: string,
  patch: LearningPatch,
  now: number,
) {
  const rows = await db
    .update(learningEntries)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(learningEntries.userId, userId), eq(learningEntries.id, id)))
    .returning(columns);
  return rows[0] ?? null;
}
export async function listLearningEntries(db: DB, userId: string, filters: LearningFilters) {
  const conditions = [
    eq(learningEntries.userId, userId),
    eq(learningEntries.archived, filters.archived ?? false),
  ];
  if (filters.kind) conditions.push(eq(learningEntries.kind, filters.kind));
  if (filters.tag)
    conditions.push(
      sql`exists (select 1 from json_each(${learningEntries.tags}) where lower(value) = lower(${filters.tag}))`,
    );
  if (filters.query) {
    conditions.push(sql`instr(lower(
      coalesce(${learningEntries.title}, '') || char(10) || coalesce(${learningEntries.body}, '') || char(10) ||
      coalesce(${learningEntries.sourceTitle}, '') || char(10) || coalesce(${learningEntries.sourceUrl}, '') || char(10) ||
      coalesce(${learningEntries.author}, '') || char(10) || ${learningEntries.tags} || char(10) ||
      ${learningEntries.takeaways} || char(10) || ${learningEntries.followUpQuestions} || char(10) || ${learningEntries.nextActions}
    ), lower(${filters.query})) > 0`);
  }
  const limit = filters.limit ?? 50;
  const rows = await db
    .select(columns)
    .from(learningEntries)
    .where(and(...conditions))
    .orderBy(
      desc(learningEntries.pinned),
      desc(sql`coalesce(${learningEntries.occurredAt}, ${learningEntries.createdAt})`),
      desc(learningEntries.updatedAt),
      desc(learningEntries.id),
    )
    .limit(limit + 1)
    .offset(filters.offset ?? 0);
  return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
}
