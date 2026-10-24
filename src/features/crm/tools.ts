import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { addContact, addNote, getContact, listContacts, listNotes, updateContact } from "./repo";

const id = z.string().trim().min(1).max(200);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const text = (max: number) => z.string().trim().min(1).max(max);
const contactFields = {
  name: text(200),
  company: text(200).nullable().optional(),
  title: text(200).nullable().optional(),
  email: z.email().max(320).nullable().optional(),
  linkedinUrl: z
    .url({ protocol: /^https?$/ })
    .max(2_000)
    .nullable()
    .optional(),
  whereMet: text(1_000).nullable().optional(),
  tags: z.array(text(80)).max(30).optional(),
  lastContactedAt: timestamp.nullable().optional(),
  followUpAt: timestamp.nullable().optional(),
};
export const contactSchema = z.object({
  id,
  name: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  whereMet: z.string().nullable(),
  tags: z.array(z.string()),
  lastContactedAt: timestamp.nullable(),
  followUpAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const noteSchema = z.object({
  id,
  subjectType: z.string(),
  subjectId: z.string().nullable(),
  subjectLabel: z.string().nullable(),
  kind: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const contactOutputSchema = z.object({ tab: z.literal("people"), contact: contactSchema });
export const contactsOutputSchema = z.object({
  tab: z.literal("people"),
  contacts: z.array(contactSchema),
  hasMore: z.boolean(),
});
export const noteOutputSchema = z.object({ tab: z.literal("people"), note: noteSchema });
export const notesOutputSchema = z.object({
  tab: z.literal("people"),
  notes: z.array(noteSchema),
  hasMore: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;
export type ContactOutput = z.infer<typeof contactOutputSchema>;
export type ContactsOutput = z.infer<typeof contactsOutputSchema>;
export type Note = z.infer<typeof noteSchema>;
export type NoteOutput = z.infer<typeof noteOutputSchema>;
export type NotesOutput = z.infer<typeof notesOutputSchema>;
const page = {
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
};
// Preserve the static partial field types for the handler as well as runtime validation.
const updateSchema = z.object(contactFields).partial().extend({ contactId: id });
const contactsInput = { query: text(200).optional(), contactId: id.optional(), ...page };
const subjectType = z.enum(["contact", "company", "job", "event", "general"]);
const noteInput = {
  subjectType,
  subjectId: id.optional(),
  subjectLabel: text(300).optional(),
  kind: z
    .enum(["note", "prep", "outreach_draft", "dossier", "brief", "interview_intel"])
    .optional(),
  title: text(300).optional(),
  body: text(20_000),
};
const notesInput = {
  subjectType: subjectType.optional(),
  subjectId: id.optional(),
  subjectLabel: text(300).optional(),
  ...page,
};
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const missingContact = () =>
  fail("NOT_FOUND", "Contact not found.", "Use list_contacts to choose one of your contacts.");
function validated<S extends z.ZodType>(
  schema: S,
  action: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>,
): ToolDef["handler"] {
  return async (args, ctx) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success)
      return fail(
        "INVALID_INPUT",
        "Check the supplied fields and size limits.",
        "No data was changed.",
      );
    try {
      return await action(parsed.data, ctx);
    } catch {
      return fail(
        "INTERNAL",
        "Your People data could not be loaded or saved.",
        "Try again in a moment.",
      );
    }
  };
}
export const crmTools: ToolDef[] = [
  {
    name: "add_contact",
    title: "Add a contact",
    description:
      "Use this to save someone the person met, for example 'I met Jane from Stripe at a meetup'. Store supplied details only. Do not use for an existing contact; use list_contacts then update_contact. Next, call add_note with the returned contact.id and subjectType contact to save conversation details, then offer a follow-up date.",
    input: contactFields,
    output: contactOutputSchema,
    annotations: write,
    status: {
      invoking: "Adding someone to your network…",
      invoked: "Network += 1. Keep in touch.",
    },
    opensPanel: true,
    handler: validated(z.object(contactFields), async (args, ctx) =>
      ok("Contact saved. Use add_note to record what you discussed.", {
        tab: "people",
        contact: await addContact(ctx.db, ctx.userId, args, ctx.now().getTime()),
      }),
    ),
  },
  {
    name: "update_contact",
    title: "Update a contact",
    description:
      "Use this to update an existing saved contact, including followUpAt or lastContactedAt (epoch milliseconds). Omitted fields stay unchanged; null clears an optional value. Do not use to create a person or record conversation notes. Next, show the saved details or call add_note for the conversation.",
    input: updateSchema.shape,
    output: contactOutputSchema,
    annotations: write,
    status: { invoking: "Updating your contact…", invoked: "Contact updated." },
    handler: validated(updateSchema, async ({ contactId, ...patch }, ctx) => {
      if (!Object.keys(patch).length)
        return fail("INVALID_INPUT", "Provide at least one contact field to update.");
      const contact = await updateContact(
        ctx.db,
        ctx.userId,
        contactId,
        patch,
        ctx.now().getTime(),
      );
      return contact ? ok("Contact updated.", { tab: "people", contact }) : missingContact();
    }),
  },
  {
    name: "list_contacts",
    title: "List and search contacts",
    description:
      "Use this to browse or search the signed-in person's contacts by name, company, title, email, where met, or tag; contactId returns one contact. Do not use to search the public web or other people's address books. Next, choose a contact and call list_notes for their timeline, update_contact for details, or add_note to record a conversation.",
    input: contactsInput,
    output: contactsOutputSchema,
    annotations: read,
    status: { invoking: "Loading your network…", invoked: "Your people are ready." },
    opensPanel: true,
    handler: validated(z.object(contactsInput), async (args, ctx) => {
      const limit = args.limit ?? 50;
      const rows = await listContacts(ctx.db, ctx.userId, { ...args, limit: limit + 1 });
      return ok(`${Math.min(rows.length, limit)} contacts loaded.`, {
        tab: "people",
        contacts: rows.slice(0, limit),
        hasMore: rows.length > limit,
      });
    }),
  },
  {
    name: "add_note",
    title: "Add a note",
    description:
      "Use this to save user-provided notes on a contact, company, job, event, or general topic. After 'I met Jane from Stripe at…', first call add_contact (or find her with list_contacts), then use its contact.id as subjectId and subjectType contact here for what was discussed. Do not invent conversations or use notes as a substitute for adding a contact. Next, show the note and offer to set followUpAt via update_contact or draft outreach in ChatGPT.",
    input: noteInput,
    output: noteOutputSchema,
    annotations: write,
    status: {
      invoking: "Saving your conversation notes…",
      invoked: "Note saved. Context preserved.",
    },
    opensPanel: true,
    handler: validated(z.object(noteInput), async (args, ctx) => {
      if (args.subjectType === "contact") {
        if (!args.subjectId)
          return fail(
            "INVALID_INPUT",
            "Contact notes require subjectId.",
            "Use list_contacts or add_contact first.",
          );
        if (!(await getContact(ctx.db, ctx.userId, args.subjectId))) return missingContact();
      }
      if (
        ["company", "job", "event"].includes(args.subjectType) &&
        !args.subjectId &&
        !args.subjectLabel
      )
        return fail("INVALID_INPUT", "Provide a subjectId or subjectLabel for this note.");
      return ok("Note saved.", {
        tab: "people",
        note: await addNote(ctx.db, ctx.userId, args, ctx.now().getTime()),
      });
    }),
  },
  {
    name: "list_notes",
    title: "List saved notes",
    description:
      "Use this to retrieve the signed-in person's notes, optionally scoped by subjectType and subjectId or subjectLabel; results are newest first. Do not use to look up public facts or another person's notes. Next, summarize the relevant saved context, add_note for new details, or use ChatGPT to draft outreach without sending it.",
    input: notesInput,
    output: notesOutputSchema,
    annotations: read,
    status: { invoking: "Loading saved context…", invoked: "Notes ready." },
    handler: validated(z.object(notesInput), async (args, ctx) => {
      if (args.subjectId && !args.subjectType)
        return fail("INVALID_INPUT", "Provide subjectType with subjectId.");
      const limit = args.limit ?? 50;
      const rows = await listNotes(ctx.db, ctx.userId, { ...args, limit: limit + 1 });
      return ok(`${Math.min(rows.length, limit)} notes loaded.`, {
        tab: "people",
        notes: rows.slice(0, limit),
        hasMore: rows.length > limit,
      });
    }),
  },
];
