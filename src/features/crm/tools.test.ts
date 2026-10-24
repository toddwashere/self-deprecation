import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../db/client";
import { contacts, notes, users } from "../../db/schema";
import type { Env } from "../../env";
import { createLogger } from "../../lib/log";
import type { ToolContext } from "../../mcp/types";
import { crmFeature } from "./index";

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
function context(userId: string): ToolContext {
  return {
    userId,
    identity: { userId, name: userId },
    db,
    env: testEnv,
    now: () => new Date(now),
    log: createLogger("test"),
  };
}
async function call(name: string, args: Record<string, unknown> = {}, userId = "a") {
  const tool = crmFeature.tools.find((t) => t.name === name);
  expect(tool, `${name} must be registered`).toBeDefined();
  if (!tool) throw new Error("Unreachable");
  const result = await tool.handler(args as never, context(userId));
  if (!result.isError) expect(tool.output?.safeParse(result.structuredContent).success).toBe(true);
  return result;
}
function error(result: Awaited<ReturnType<typeof call>>, code: string) {
  expect(result).toMatchObject({ isError: true, _meta: { "self-deprecation/error": { code } } });
}
async function person() {
  const result = await call("add_contact", {
    name: "Jane Example",
    company: "Stripe",
    whereMet: "Example meetup",
    tags: ["platform"],
    followUpAt: now,
  });
  return result.structuredContent?.contact as { id: string };
}

describe("CRM tool contracts", () => {
  it("registers all five tools with bounded metadata and caller-only identity", () => {
    expect(crmFeature.tools.map((t) => t.name)).toEqual([
      "add_contact",
      "update_contact",
      "list_contacts",
      "add_note",
      "list_notes",
    ]);
    for (const tool of crmFeature.tools) {
      expect(tool.input).not.toHaveProperty("userId");
      expect(tool.output).toBeDefined();
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(tool.status.invoking.length).toBeLessThanOrEqual(64);
      expect(tool.status.invoked.length).toBeLessThanOrEqual(64);
    }
  });
  it("adds a contact, searches literally, paginates, and preserves omitted fields on update", async () => {
    const contact = await person();
    await call("add_contact", { name: "Zed Example", company: "Other" });
    const first = await call("list_contacts", { limit: 1 });
    expect(first.structuredContent).toMatchObject({
      contacts: [{ id: contact.id, name: "Jane Example" }],
      hasMore: true,
    });
    expect(
      (await call("list_contacts", { query: "STRIPE" })).structuredContent?.contacts,
    ).toHaveLength(1);
    expect((await call("list_contacts", { query: "%" })).structuredContent?.contacts).toHaveLength(
      0,
    );
    expect((await call("list_contacts", { offset: 1, limit: 1 })).structuredContent).toMatchObject({
      contacts: [{ name: "Zed Example" }],
      hasMore: false,
    });
    expect(
      (await call("update_contact", { contactId: contact.id, followUpAt: null })).structuredContent,
    ).toMatchObject({ contact: { name: "Jane Example", company: "Stripe", followUpAt: null } });
    expect(
      (await call("list_contacts", { contactId: contact.id })).structuredContent,
    ).toMatchObject({ contacts: [{ id: contact.id }] });
  });
  it("isolates contacts, prevents foreign updates and attachments, and ignores forged identity", async () => {
    const contact = await person();
    expect((await call("list_contacts", { userId: "a" }, "b")).structuredContent?.contacts).toEqual(
      [],
    );
    error(
      await call("update_contact", { contactId: contact.id, name: "Stolen" }, "b"),
      "NOT_FOUND",
    );
    error(
      await call(
        "add_note",
        { subjectType: "contact", subjectId: contact.id, body: "Foreign note" },
        "b",
      ),
      "NOT_FOUND",
    );
    expect(
      (await call("list_contacts", { contactId: contact.id })).structuredContent,
    ).toMatchObject({ contacts: [{ name: "Jane Example" }] });
  });
  it("saves and isolates contact and generic notes with validated output", async () => {
    const contact = await person();
    await call("add_note", {
      subjectType: "contact",
      subjectId: contact.id,
      title: "Met",
      body: "Discussed platform work.",
    });
    await call("add_note", {
      subjectType: "company",
      subjectLabel: "Example Co",
      kind: "outreach_draft",
      body: "Public-safe draft",
    });
    const timeline = await call("list_notes", { subjectType: "contact", subjectId: contact.id });
    expect(timeline.structuredContent).toMatchObject({
      notes: [{ body: "Discussed platform work.", subjectId: contact.id }],
    });
    expect(
      (await call("list_notes", { subjectLabel: "Example Co" })).structuredContent?.notes,
    ).toHaveLength(1);
    expect((await call("list_notes", { userId: "a" }, "b")).structuredContent?.notes).toEqual([]);
    expect((await call("list_notes", { limit: 1 })).structuredContent?.hasMore).toBe(true);
  });
  it("rejects malformed, oversized and ambiguous writes without exposing private data", async () => {
    error(await call("add_contact", { name: " " }), "INVALID_INPUT");
    error(await call("add_contact", { name: "Example", email: "not-an-email" }), "INVALID_INPUT");
    error(
      await call("add_contact", { name: "Example", linkedinUrl: "javascript:alert(1)" }),
      "INVALID_INPUT",
    );
    error(await call("add_contact", { name: "Example", followUpAt: -1 }), "INVALID_INPUT");
    error(await call("update_contact", { contactId: "missing" }), "INVALID_INPUT");
    error(await call("update_contact", { contactId: "missing", name: "Example" }), "NOT_FOUND");
    error(await call("add_note", { subjectType: "contact", body: "No contact" }), "INVALID_INPUT");
    error(await call("add_note", { subjectType: "general", body: " " }), "INVALID_INPUT");
    error(
      await call("add_note", { subjectType: "general", body: "x".repeat(20_001) }),
      "INVALID_INPUT",
    );
    error(await call("list_contacts", { limit: 101 }), "INVALID_INPUT");
    error(await call("list_notes", { subjectId: "no-type" }), "INVALID_INPUT");
  });
});
