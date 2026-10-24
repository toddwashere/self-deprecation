import { z } from "zod";
import { fail, ok } from "../../mcp/result";
import type { ToolDef } from "../../mcp/types";
import { getEvent, listEvents, saveEvent, updateEvent } from "./repo";
import { eventMetadata } from "./service";

export const eventStatusSchema = z.enum(["interested", "going", "attended", "skipped"]);
const sourceSchema = z.enum(["chatgpt_search", "manual", "meetup", "luma"]);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const eventUrl = z
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use a public HTTPS event URL without credentials.");
const editableFields = {
  title: z.string().trim().min(1).max(300).optional(),
  url: eventUrl.nullable().optional(),
  startsAt: timestamp.nullable().optional(),
  endsAt: timestamp.nullable().optional(),
  venue: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  source: sourceSchema.optional(),
  status: eventStatusSchema.optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
};
const saveInput = z
  .object(editableFields)
  .refine((event) => event.title || event.url, "Supply an event title or URL.");
const updateFields = { eventId: z.string().min(1).max(100), ...editableFields };
const updateInput = z
  .object(updateFields)
  .refine(
    ({ eventId: _, ...patch }) => Object.values(patch).some((value) => value !== undefined),
    "Supply a field to update.",
  );
const listFields = {
  period: z.enum(["all", "upcoming", "past", "undated"]).optional(),
  status: eventStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
};
export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  startsAt: timestamp.nullable(),
  endsAt: timestamp.nullable(),
  venue: z.string().nullable(),
  city: z.string().nullable(),
  source: sourceSchema,
  status: eventStatusSchema,
  notes: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const eventOutputSchema = z.object({ tab: z.literal("events"), event: eventSchema });
export const saveEventOutputSchema = eventOutputSchema.extend({
  metadata: z.object({ status: z.enum(["enriched", "unavailable", "not_requested"]) }),
});
export const listEventsOutputSchema = z.object({
  tab: z.literal("events"),
  events: z.array(eventSchema),
  asOf: timestamp,
  progress: z.object({ stage: z.literal("done"), done: z.number().int(), total: z.number().int() }),
});
export type SavedEvent = z.infer<typeof eventSchema>;
export type ListEventsOutput = z.infer<typeof listEventsOutputSchema>;
export type EventOutput = z.infer<typeof eventOutputSchema>;
function validDates(event: { startsAt?: number | null; endsAt?: number | null }) {
  return event.startsAt == null || event.endsAt == null || event.endsAt >= event.startsAt;
}
const invalid = () =>
  fail(
    "INVALID_INPUT",
    "Check the event fields and dates.",
    "Supply a title or HTTPS URL; end time must follow start time.",
  );

export const eventsTools: ToolDef[] = [
  {
    name: "save_event",
    title: "Save an event",
    description:
      "Save a chosen event from web search or a pasted URL to the caller's calendar list. Use after the user selects an event; supply confirmed dates in epoch milliseconds. Do not use to discover events or register tickets. Next: show the saved event and offer to mark it going.",
    input: editableFields,
    output: saveEventOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    status: {
      invoking: "Saving a reason to leave the IDE…",
      invoked: "Event saved. See you out there.",
    },
    opensPanel: true,
    async handler(args, ctx) {
      const parsed = saveInput.safeParse(args);
      if (!parsed.success || !validDates(parsed.data)) return invalid();
      const data = parsed.data;
      const metadata = data.url
        ? await eventMetadata(data.url)
        : { status: "not_requested" as const };
      const title =
        data.title ??
        ("title" in metadata ? metadata.title : undefined) ??
        (data.url ? new URL(data.url).hostname : "Event");
      const event = await saveEvent(ctx.db, ctx.userId, { ...data, title }, ctx.now().getTime());
      return ok(`Saved ${event.title}.`, {
        tab: "events",
        event,
        metadata: { status: metadata.status },
      });
    },
  },
  {
    name: "list_events",
    title: "List saved events",
    description:
      "List the caller's saved events, optionally by upcoming, past, undated, or attendance status. Use to review plans and previously attended events. Do not use for web discovery or another person's calendar. Next: offer to open an event link or update its status.",
    input: listFields,
    output: listEventsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: {
      invoking: "Checking the human calendar…",
      invoked: "Events ready. Humans still welcome.",
    },
    opensPanel: true,
    async handler(args, ctx) {
      const parsed = z.object(listFields).safeParse(args);
      if (!parsed.success) return invalid();
      const now = ctx.now().getTime();
      const events = await listEvents(ctx.db, ctx.userId, parsed.data, now);
      return ok(`${events.length} saved events.`, {
        tab: "events",
        events,
        asOf: now,
        progress: { stage: "done", done: events.length, total: events.length },
      });
    },
  },
  {
    name: "update_event",
    title: "Update a saved event",
    description:
      "Update a caller-owned event's facts, notes, or interested/going/attended/skipped status. Use for a selected saved event. Do not use to RSVP on an external site or change someone else's event. Next: confirm the change and offer to review saved events.",
    input: updateFields,
    output: eventOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    status: { invoking: "Updating the human calendar…", invoked: "Event updated. Plan intact." },
    async handler(args, ctx) {
      const parsed = updateInput.safeParse(args);
      if (!parsed.success) return invalid();
      const { eventId, ...patch } = parsed.data;
      const current = await getEvent(ctx.db, ctx.userId, eventId);
      if (!current)
        return fail("NOT_FOUND", "Event not found.", "List your saved events and choose one.");
      if (!validDates({ ...current, ...patch })) return invalid();
      const event = await updateEvent(ctx.db, ctx.userId, eventId, patch, ctx.now().getTime());
      if (!event)
        return fail("NOT_FOUND", "Event not found.", "List your saved events and choose one.");
      return ok(`Updated ${event.title}.`, { tab: "events", event });
    },
  },
];
