import { and, desc, eq, gte, sql, sum } from "drizzle-orm";
import type { DB } from "../../db/client";
import { apiUsage, notes, userState } from "../../db/schema";
import type { CompanyDossier } from "./agent";

const API_NAME = "agents.dossier";

export type DossierClaim = "ok" | "user_limit" | "global_limit";
export interface DossierTask {
  taskId: string;
  sessionId: string;
  noteId: string;
  company: string;
  website?: string;
  researchedAt: number;
  status: "pending" | "running" | "done" | "error";
  progress: { stage: "researching" | "done"; done: number; total: number };
  dossier?: CompanyDossier;
}

export async function claimDossierRun(
  db: DB,
  userId: string,
  limits: { user: number; global: number; since: number },
  now: number,
): Promise<DossierClaim> {
  const id = crypto.randomUUID();
  const result = await db.run(sql`
    insert into api_usage (id, user_id, api, units, input_tokens, created_at)
    select ${id}, ${userId}, ${API_NAME}, 1, 0, ${now}
    where (
      select coalesce(sum(units), 0)
      from api_usage
      where api = ${API_NAME} and user_id = ${userId} and created_at >= ${limits.since}
    ) < ${limits.user}
    and (
      select coalesce(sum(units), 0)
      from api_usage
      where api = ${API_NAME} and created_at >= ${limits.since}
    ) < ${limits.global}
  `);
  if (result.meta.changes === 1) return "ok";

  const [userUsage, globalUsage] = await Promise.all([
    db
      .select({ value: sum(apiUsage.units) })
      .from(apiUsage)
      .where(
        and(
          eq(apiUsage.api, API_NAME),
          eq(apiUsage.userId, userId),
          gte(apiUsage.createdAt, limits.since),
        ),
      )
      .get(),
    db
      .select({ value: sum(apiUsage.units) })
      .from(apiUsage)
      .where(and(eq(apiUsage.api, API_NAME), gte(apiUsage.createdAt, limits.since)))
      .get(),
  ]);
  return Number(userUsage?.value ?? 0) >= limits.user && limits.user <= limits.global
    ? "user_limit"
    : Number(globalUsage?.value ?? 0) >= limits.global
      ? "global_limit"
      : "user_limit";
}

const dossierNoteFields = {
  id: notes.id,
  subjectType: notes.subjectType,
  subjectId: notes.subjectId,
  subjectLabel: notes.subjectLabel,
  kind: notes.kind,
  title: notes.title,
  body: notes.body,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

export async function saveDossier(
  db: DB,
  userId: string,
  company: string,
  dossier: CompanyDossier,
  now: number,
) {
  const [row] = await db
    .insert(notes)
    .values({
      id: crypto.randomUUID(),
      userId,
      subjectType: "company",
      subjectLabel: company,
      kind: "dossier",
      title: `${company} company dossier`,
      body: JSON.stringify(dossier),
      createdAt: now,
      updatedAt: now,
    })
    .returning(dossierNoteFields);
  return row;
}

export async function listDossiers(db: DB, userId: string, company?: string) {
  return db
    .select(dossierNoteFields)
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.kind, "dossier"),
        company ? eq(notes.subjectLabel, company) : undefined,
      ),
    )
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

export async function putDossierTask(db: DB, userId: string, task: DossierTask, now: number) {
  await db
    .insert(userState)
    .values({ userId, key: `task.${task.taskId}`, value: task, updatedAt: now })
    .onConflictDoUpdate({
      target: [userState.userId, userState.key],
      set: { value: task, updatedAt: now },
      setWhere: eq(userState.userId, userId),
    });
}

export async function completeDossierTask(
  db: DB,
  userId: string,
  task: DossierTask,
  dossier: CompanyDossier,
  now: number,
) {
  const completed: DossierTask = {
    ...task,
    status: "done",
    progress: { stage: "done", done: 1, total: 1 },
    dossier,
  };
  const noteWrite = db
    .insert(notes)
    .values({
      id: task.noteId,
      userId,
      subjectType: "company",
      subjectLabel: task.company,
      kind: "dossier",
      title: `${task.company} company dossier`,
      body: JSON.stringify(dossier),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: notes.id });
  const taskWrite = db
    .insert(userState)
    .values({ userId, key: `task.${task.taskId}`, value: completed, updatedAt: now })
    .onConflictDoUpdate({
      target: [userState.userId, userState.key],
      set: { value: completed, updatedAt: now },
      setWhere: eq(userState.userId, userId),
    });

  await db.batch([noteWrite, taskWrite]);
  return completed;
}

export async function failDossierTaskIfActive(
  db: DB,
  userId: string,
  task: DossierTask,
  now: number,
) {
  const failed: DossierTask = {
    ...task,
    status: "error",
    progress: { stage: "done", done: 0, total: 1 },
  };
  const result = await db
    .update(userState)
    .set({ value: failed, updatedAt: now })
    .where(
      and(
        eq(userState.userId, userId),
        eq(userState.key, `task.${task.taskId}`),
        sql`json_extract(${userState.value}, '$.status') in ('pending', 'running')`,
      ),
    );
  return result.meta.changes === 1;
}

export async function getDossierTask(db: DB, userId: string, taskId: string) {
  const row = await db
    .select({ value: userState.value })
    .from(userState)
    .where(and(eq(userState.userId, userId), eq(userState.key, `task.${taskId}`)))
    .get();
  return row?.value as DossierTask | undefined;
}
