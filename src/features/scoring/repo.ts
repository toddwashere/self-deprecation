import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { apiUsage } from "../../db/schema";

export async function getDecisionUnitsSince(
  db: DB,
  userId: string,
  since: number,
): Promise<number> {
  const row = await db
    .select({ units: sql<number>`coalesce(sum(${apiUsage.units}), 0)` })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.userId, userId),
        eq(apiUsage.api, "decisions"),
        gte(apiUsage.createdAt, since),
      ),
    )
    .get();
  return Number(row?.units ?? 0);
}

export async function recordDecisionUsage(
  db: DB,
  userId: string,
  units: number,
  inputTokens: number,
  createdAt: number,
): Promise<void> {
  await db.insert(apiUsage).values({
    id: crypto.randomUUID(),
    userId,
    api: "decisions",
    units,
    inputTokens,
    createdAt,
  });
}
