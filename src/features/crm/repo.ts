import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { contacts, notes, savedEvents } from "../../db/schema";

export type ContactInput = Pick<
  typeof contacts.$inferInsert,
  | "name"
  | "company"
  | "title"
  | "email"
  | "linkedinUrl"
  | "whereMet"
  | "tags"
  | "lastContactedAt"
  | "followUpAt"
>;
export type NoteInput = Pick<
  typeof notes.$inferInsert,
  "subjectType" | "subjectId" | "subjectLabel" | "kind" | "title" | "body"
>;
export interface ContactFilter {
  query?: string;
  contactId?: string;
  limit?: number;
  offset?: number;
}
export interface NoteFilter {
  subjectType?: string;
  subjectId?: string;
  subjectLabel?: string;
  limit?: number;
  offset?: number;
}

// Explicit projections keep identity and opaque extra data out of tool results.
const contactFields = {
  id: contacts.id,
  name: contacts.name,
  company: contacts.company,
  title: contacts.title,
  email: contacts.email,
  linkedinUrl: contacts.linkedinUrl,
  whereMet: contacts.whereMet,
  tags: contacts.tags,
  lastContactedAt: contacts.lastContactedAt,
  followUpAt: contacts.followUpAt,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};
const noteFields = {
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

export async function addContact(db: DB, userId: string, data: ContactInput, now: number) {
  const [row] = await db
    .insert(contacts)
    .values({ ...data, id: crypto.randomUUID(), userId, createdAt: now, updatedAt: now })
    .returning(contactFields);
  return row;
}
export async function getContact(db: DB, userId: string, id: string) {
  return db
    .select(contactFields)
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .get();
}
export async function listContacts(db: DB, userId: string, filter: ContactFilter) {
  const query = filter.query?.toLowerCase();
  return db
    .select(contactFields)
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        filter.contactId ? eq(contacts.id, filter.contactId) : undefined,
        query
          ? sql`instr(lower(${contacts.name} || ' ' || coalesce(${contacts.company}, '') || ' ' || coalesce(${contacts.title}, '') || ' ' || coalesce(${contacts.whereMet}, '') || ' ' || coalesce(${contacts.email}, '') || ' ' || ${contacts.tags}), ${query}) > 0`
          : undefined,
      ),
    )
    .orderBy(asc(sql`lower(${contacts.name})`), asc(contacts.id))
    .limit(filter.limit ?? 51)
    .offset(filter.offset ?? 0);
}
export async function updateContact(
  db: DB,
  userId: string,
  id: string,
  patch: Partial<ContactInput>,
  now: number,
) {
  const [row] = await db
    .update(contacts)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .returning(contactFields);
  return row;
}
export async function deleteContact(db: DB, userId: string, id: string) {
  const result = await db
    .delete(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .returning({ id: contacts.id });
  return result.length;
}
export async function addNote(db: DB, userId: string, data: NoteInput, now: number) {
  const [row] = await db
    .insert(notes)
    .values({ ...data, id: crypto.randomUUID(), userId, createdAt: now, updatedAt: now })
    .returning(noteFields);
  return row;
}
export async function getNote(db: DB, userId: string, id: string) {
  return db
    .select(noteFields)
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .get();
}
export async function listNotes(db: DB, userId: string, filter: NoteFilter) {
  return db
    .select(noteFields)
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        filter.subjectType ? eq(notes.subjectType, filter.subjectType) : undefined,
        filter.subjectId ? eq(notes.subjectId, filter.subjectId) : undefined,
        filter.subjectLabel ? eq(notes.subjectLabel, filter.subjectLabel) : undefined,
      ),
    )
    .orderBy(desc(notes.createdAt), desc(notes.id))
    .limit(filter.limit ?? 51)
    .offset(filter.offset ?? 0);
}
export async function updateNote(
  db: DB,
  userId: string,
  id: string,
  patch: Pick<NoteInput, "title" | "body">,
  now: number,
) {
  const [row] = await db
    .update(notes)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .returning(noteFields);
  return row;
}
export async function deleteNote(db: DB, userId: string, id: string) {
  const result = await db
    .delete(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .returning({ id: notes.id });
  return result.length;
}

export async function getOwnedEvent(db: DB, userId: string, id: string) {
  return db
    .select({ id: savedEvents.id })
    .from(savedEvents)
    .where(and(eq(savedEvents.userId, userId), eq(savedEvents.id, id)))
    .get();
}
