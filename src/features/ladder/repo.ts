import { and, desc, eq, sql } from "drizzle-orm";
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
  evidence: string | null | undefined,
  now: number,
) {
  const values = {
    level,
    status,
    completedAt: status === "done" ? now : null,
    updatedAt: now,
  };
  const updateValues = evidence === undefined ? values : { ...values, evidence };
  await db
    .insert(ladderQuests)
    .values({
      id: crypto.randomUUID(),
      userId,
      questId,
      ...values,
      evidence: evidence ?? null,
    })
    .onConflictDoUpdate({
      target: [ladderQuests.userId, ladderQuests.questId],
      set: updateValues,
      setWhere: eq(ladderQuests.userId, userId),
    });
  return db
    .select(questFields)
    .from(ladderQuests)
    .where(and(eq(ladderQuests.userId, userId), eq(ladderQuests.questId, questId)))
    .get();
}

// D1 executes this conditional INSERT as one atomic statement across Worker isolates.
export async function reserveLadderDecisionUsage(
  db: DB,
  userId: string,
  since: number,
  now: number,
  cap = 3,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const result = await db.run(sql`
    INSERT INTO api_usage (id, user_id, api, units, input_tokens, created_at)
    SELECT ${id}, ${userId}, 'decisions_ladder', 1, 0, ${now}
    WHERE (
      SELECT coalesce(sum(units), 0)
      FROM api_usage
      WHERE user_id = ${userId}
        AND api = 'decisions_ladder'
        AND created_at >= ${since}
    ) < ${cap}
  `);
  return result.meta.changes === 1 ? id : null;
}

export async function completeLadderDecisionUsage(
  db: DB,
  userId: string,
  reservationId: string,
  inputTokens: number,
) {
  await db
    .update(apiUsage)
    .set({ inputTokens })
    .where(
      and(
        eq(apiUsage.id, reservationId),
        eq(apiUsage.userId, userId),
        eq(apiUsage.api, "decisions_ladder"),
      ),
    );
}

export async function releaseLadderDecisionUsage(db: DB, userId: string, reservationId: string) {
  await db
    .delete(apiUsage)
    .where(
      and(
        eq(apiUsage.id, reservationId),
        eq(apiUsage.userId, userId),
        eq(apiUsage.api, "decisions_ladder"),
      ),
    );
}
