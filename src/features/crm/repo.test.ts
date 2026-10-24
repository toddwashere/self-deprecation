import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { assertUserIsolation } from "../../db/isolation-test-helper";
import { contacts, notes, users } from "../../db/schema";
import type { Env } from "../../env";
import * as repo from "./repo";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const db = createDb(testEnv.DB);
const now = 1_800_000_000_000;
beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS));
beforeEach(async () => {
  await db.delete(notes);
  await db.delete(contacts);
  await db.delete(users);
  await db.insert(users).values(["a", "b"].map((id) => ({ id, createdAt: now, updatedAt: now })));
});
it("T1: contacts cannot be read, changed, or deleted by another user", async () => {
  await assertUserIsolation({
    userA: "a",
    userB: "b",
    createForA: async () => (await repo.addContact(db, "a", { name: "Jane Example" }, now)).id,
    list: async (userId) => (await repo.listContacts(db, userId, {})).map((row) => row.id),
    update: async (userId, id) =>
      (await repo.updateContact(db, userId, id, { name: "Changed" }, now)) ? 1 : 0,
    remove: (userId, id) => repo.deleteContact(db, userId, id),
    readOwnerValue: async (id) => (await repo.getContact(db, "a", id))?.name ?? null,
    expectedOwnerValue: "Jane Example",
  });
});
it("T1: notes cannot be read, changed, or deleted by another user", async () => {
  await assertUserIsolation({
    userA: "a",
    userB: "b",
    createForA: async () =>
      (await repo.addNote(db, "a", { subjectType: "general", body: "Private example" }, now)).id,
    list: async (userId) => (await repo.listNotes(db, userId, {})).map((row) => row.id),
    update: async (userId, id) =>
      (await repo.updateNote(db, userId, id, { body: "Changed" }, now)) ? 1 : 0,
    remove: (userId, id) => repo.deleteNote(db, userId, id),
    readOwnerValue: async (id) => (await repo.getNote(db, "a", id))?.body ?? null,
    expectedOwnerValue: "Private example",
  });
});
it("owner update/delete by ID work and note order is newest first", async () => {
  const contact = await repo.addContact(db, "a", { name: "Jane Example" }, now);
  const older = await repo.addNote(db, "a", { subjectType: "general", body: "Older" }, now);
  const newer = await repo.addNote(db, "a", { subjectType: "general", body: "Newer" }, now + 1);
  expect((await repo.listNotes(db, "a", {})).map((row) => row.id)).toEqual([newer.id, older.id]);
  expect(await repo.updateNote(db, "a", older.id, { body: "Edited" }, now + 2)).toMatchObject({
    body: "Edited",
  });
  expect(await repo.deleteNote(db, "a", older.id)).toBe(1);
  expect(await repo.getNote(db, "a", older.id)).toBeUndefined();
  expect(await repo.deleteContact(db, "a", contact.id)).toBe(1);
  expect(await repo.getContact(db, "a", contact.id)).toBeUndefined();
});
