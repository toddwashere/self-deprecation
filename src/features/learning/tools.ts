import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolContext, ToolDef, ToolResult } from "../../mcp/types";
import { learningCopy as copy } from "./copy";
import {
  getLearningEntry,
  listLearningEntries,
  saveLearningEntry,
  updateLearningEntry,
} from "./repo";

export const learningKindSchema = z.enum([
  "reference",
  "talk",
  "course",
  "article",
  "experiment",
  "reflection",
]);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const sourceUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS source URL without credentials.");
const lines = z
  .array(
    z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0),
  )
  .max(50);
const fields = {
  title: z.string().trim().min(1).max(300),
  kind: learningKindSchema.optional(),
  body: z.string().max(50_000).nullable().optional(),
  sourceUrl: sourceUrl.nullable().optional(),
  sourceTitle: z.string().max(500).nullable().optional(),
  author: z.string().max(300).nullable().optional(),
  occurredAt: timestamp.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  takeaways: lines.optional(),
  followUpQuestions: lines.optional(),
  nextActions: lines.optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
};
const entryId = z.string().min(1).max(100);
const saveSchema = z.object(fields);
const updateFields = { entryId, ...saveSchema.partial().shape };
const updateSchema = z
  .object(updateFields)
  .refine(
    ({ entryId: _, ...patch }) => Object.values(patch).some((value) => value !== undefined),
    "Supply a field to update.",
  );
const listFields = {
  kind: learningKindSchema.optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
};
const searchFields = { ...listFields, query: z.string().trim().min(1).max(300) };
export const learningEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: learningKindSchema,
  body: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  author: z.string().nullable(),
  occurredAt: timestamp.nullable(),
  tags: z.array(z.string()),
  takeaways: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  nextActions: z.array(z.string()),
  pinned: z.boolean(),
  archived: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const learningEntryOutputSchema = z.object({
  tab: z.literal("learning"),
  entry: learningEntrySchema,
});
export const learningListOutputSchema = z.object({
  tab: z.literal("learning"),
  entries: z.array(learningEntrySchema),
  filters: z.object({
    query: z.string(),
    kind: learningKindSchema.nullable(),
    tag: z.string(),
    archived: z.boolean(),
    limit: z.number().int(),
    offset: z.number().int(),
  }),
  hasMore: z.boolean(),
  asOf: timestamp,
  progress: z.object({ stage: z.literal("done"), done: z.number().int(), total: z.number().int() }),
});
export type LearningEntry = z.infer<typeof learningEntrySchema>;
export type LearningEntryInput = z.infer<typeof saveSchema>;
export type LearningEntryOutput = z.infer<typeof learningEntryOutputSchema>;
export type LearningListOutput = z.infer<typeof learningListOutputSchema>;
const invalid = () => fail("INVALID_INPUT", copy.invalid, copy.invalidHint);
const missing = () => fail("NOT_FOUND", copy.missing, copy.missingHint);
function checked<T>(
  schema: z.ZodType<T>,
  run: (args: T, ctx: ToolContext) => Promise<ToolResult>,
): ToolDef["handler"] {
  return async (args, ctx) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) return invalid();
    try {
      return await run(parsed.data, ctx);
    } catch {
      return fail("INTERNAL", copy.unavailable, copy.unavailableHint);
    }
  };
}
const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};
const writeAnnotations = { ...readAnnotations, readOnlyHint: false };
async function browse(
  args: z.infer<z.ZodObject<typeof listFields>> & { query?: string },
  ctx: ToolContext,
) {
  const result = await listLearningEntries(ctx.db, ctx.userId, args);
  return ok(`${result.entries.length} learning entries.`, {
    tab: "learning",
    ...result,
    filters: {
      query: args.query ?? "",
      kind: args.kind ?? null,
      tag: args.tag ?? "",
      archived: args.archived ?? false,
      limit: args.limit ?? 50,
      offset: args.offset ?? 0,
    },
    asOf: ctx.now().getTime(),
    progress: { stage: "done", done: result.entries.length, total: result.entries.length },
  });
}
export const learningTools: ToolDef[] = [
  {
    name: "save_learning_entry",
    title: "Save a learning entry",
    description:
      "Save the caller's talk, course, article, experiment, reflection, or quick reference with notes, supplied source link, takeaways, questions, next actions, and tags. Use when asked to capture learning. Do not use for CRM notes or invent missing links or facts. Next: show the saved entry and offer to retrieve or refine it.",
    input: fields,
    output: learningEntryOutputSchema,
    annotations: { ...writeAnnotations, idempotentHint: false },
    status: copy.saveStatus,
    opensPanel: true,
    handler: checked(saveSchema, async (args, ctx) => {
      const entry = await saveLearningEntry(ctx.db, ctx.userId, args, ctx.now().getTime());
      return ok(`Saved ${entry.title}.`, { tab: "learning", entry });
    }),
  },
  {
    name: "list_learning_entries",
    title: "List learning entries",
    description:
      "Browse the caller's stored learning journal, optionally by kind, exact tag, or archive state. Defaults to active entries, pinned first, then newest; paginate with offset/limit. Use for reviewing previous learning. Do not use for web discovery or CRM notes. Next: get an entry by ID or search for a phrase.",
    input: listFields,
    output: learningListOutputSchema,
    annotations: readAnnotations,
    status: copy.listStatus,
    opensPanel: true,
    handler: checked(z.object(listFields), browse),
  },
  {
    name: "get_learning_entry",
    title: "Get a learning entry",
    description:
      "Retrieve one caller-owned learning entry including original notes, source, takeaways, follow-up questions, and next actions. Use after selecting a stored journal entry. Do not use to fetch a website or read another person's notes. Next: show its quick reference and offer a targeted update.",
    input: { entryId },
    output: learningEntryOutputSchema,
    annotations: readAnnotations,
    status: copy.getStatus,
    opensPanel: true,
    handler: checked(z.object({ entryId }), async (args, ctx) => {
      const entry = await getLearningEntry(ctx.db, ctx.userId, args.entryId);
      return entry ? ok(`Retrieved ${entry.title}.`, { tab: "learning", entry }) : missing();
    }),
  },
  {
    name: "update_learning_entry",
    title: "Update a learning entry",
    description:
      "Partially update one caller-owned journal entry, preserving omitted fields; supplied arrays replace those lists, null clears an optional fact. Use to revise selected notes, takeaways, tags, pin, or archive state. Do not use to rewrite user wording without instruction or edit CRM notes. Next: confirm the saved change and show the entry.",
    input: updateFields,
    output: learningEntryOutputSchema,
    annotations: writeAnnotations,
    status: copy.updateStatus,
    opensPanel: true,
    handler: checked(updateSchema, async ({ entryId, ...patch }, ctx) => {
      const entry = await updateLearningEntry(
        ctx.db,
        ctx.userId,
        entryId,
        patch,
        ctx.now().getTime(),
      );
      return entry ? ok(`Updated ${entry.title}.`, { tab: "learning", entry }) : missing();
    }),
  },
  {
    name: "search_learning_entries",
    title: "Search learning entries",
    description:
      "Search the caller's stored journal by a literal phrase in title, body, source title/URL, author, tags, takeaways, questions, or next actions; case-insensitive for ASCII. Filters apply before pagination. Use to retrieve prior learning. Do not use to search the web or CRM notes. Next: get the relevant entry by ID and cite its supplied source if present.",
    input: searchFields,
    output: learningListOutputSchema,
    annotations: readAnnotations,
    status: copy.searchStatus,
    opensPanel: true,
    handler: checked(z.object(searchFields), browse),
  },
];
