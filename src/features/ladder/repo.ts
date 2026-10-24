import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { apiUsage, ladderAssessments, ladderQuests } from "../../db/schema";

export interface SavedAssessment {
  level: number;
  levelP: number[];
  dimensionScores: Record<string, number>;
  answers: Record<string, unknown>;
  source: string;
}

const assessmentFields = {
  id: ladderAssessments.id,
  level: ladderAssessments.level,
  levelP: ladderAssessments.levelP,
  dimensionScores: ladderAssessments.dimensionScores,
  source: ladderAssessments.source,
  createdAt: ladderAssessments.createdAt,
};

const questFields = {
  questId: ladderQuests.questId,
  level: ladderQuests.level,
  status: ladderQuests.status,
  evidence: ladderQuests.evidence,
  completedAt: ladderQuests.completedAt,
  updatedAt: ladderQuests.updatedAt,
};

export async function saveAssessment(
  db: DB,
  userId: string,
  assessment: SavedAssessment,
  now: number,
) {
  const [row] = await db
    .insert(ladderAssessments)
    .values({ id: crypto.randomUUID(), userId, ...assessment, createdAt: now })
    .returning(assessmentFields);
  return row;
}

export async function getLatestAssessment(db: DB, userId: string) {
  return db
    .select(assessmentFields)
    .from(ladderAssessments)
    .where(eq(ladderAssessments.userId, userId))
    .orderBy(desc(ladderAssessments.createdAt), desc(ladderAssessments.id))
    .limit(1)
    .get();
}

export async function listAssessments(db: DB, userId: string, limit = 12) {
  return db
    .select(assessmentFields)
    .from(ladderAssessments)
    .where(eq(ladderAssessments.userId, userId))
    .orderBy(desc(ladderAssessments.createdAt), desc(ladderAssessments.id))
    .limit(limit);
}

export async function listQuestStates(db: DB, userId: string) {
  return db.select(questFields).from(ladderQuests).where(eq(ladderQuests.userId, userId));
}

export async function updateQuestState(
  db: DB,
  userId: string,
  questId: string,
  level: number,
  status: "todo" | "done",
  evidence: string | null,
  now: number,
) {
  const values = {
    level,
    status,
    evidence,
    completedAt: status === "done" ? now : null,
    updatedAt: now,
  };
  await db
    .insert(ladderQuests)
    .values({ id: crypto.randomUUID(), userId, questId, ...values })
    .onConflictDoUpdate({
      target: [ladderQuests.userId, ladderQuests.questId],
      set: values,
      setWhere: eq(ladderQuests.userId, userId),
    });
  return db
    .select(questFields)
    .from(ladderQuests)
    .where(and(eq(ladderQuests.userId, userId), eq(ladderQuests.questId, questId)))
    .get();
}

export async function getLadderDecisionUnitsSince(db: DB, userId: string, since: number) {
  const row = await db
    .select({ units: sql<number>`coalesce(sum(${apiUsage.units}), 0)` })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.userId, userId),
        eq(apiUsage.api, "decisions_ladder"),
        gte(apiUsage.createdAt, since),
      ),
    )
    .get();
  return Number(row?.units ?? 0);
}

export async function recordLadderDecisionUsage(
  db: DB,
  userId: string,
  inputTokens: number,
  now: number,
) {
  await db.insert(apiUsage).values({
    id: crypto.randomUUID(),
    userId,
    api: "decisions_ladder",
    units: 1,
    inputTokens,
    createdAt: now,
  });
}
