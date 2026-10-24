import { and, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { userState } from "../../db/schema";

export async function getTaskState(db: DB, userId: string, taskId: string) {
  const row = await db
    .select({ value: userState.value })
    .from(userState)
    .where(and(eq(userState.userId, userId), eq(userState.key, `task.${taskId}`)))
    .get();
  return row?.value;
}
