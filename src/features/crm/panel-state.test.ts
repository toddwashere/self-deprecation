import { describe, expect, it } from "vitest";
import { contactListRequest, initialPeopleList } from "./panel-state";
import type { Contact, ContactsOutput } from "./tools";

const jane: Contact = {
  id: "jane",
  name: "Jane Example",
  company: "Stripe",
  title: null,
  email: null,
  linkedinUrl: null,
  whereMet: null,
  tags: [],
  lastContactedAt: null,
  followUpAt: null,
  createdAt: 1000,
  updatedAt: 1000,
};
const output: ContactsOutput = {
  tab: "people",
  contacts: [jane],
  hasMore: true,
  filters: { query: "Stripe", contactId: null, limit: 10, offset: 20 },
};
describe("People list initialization and requests", () => {
  it("shows the initiating filtered page immediately and keeps its normalized query", () => {
    expect(initialPeopleList(output)).toEqual({
      contacts: [jane],
      selected: null,
      filters: { query: "Stripe", contactId: null, limit: 10, offset: 20 },
      hasMore: true,
      ready: true,
    });
  });
  it("selects the requested contact and retains the contactId constraint", () => {
    const initial = initialPeopleList({
      ...output,
      hasMore: false,
      filters: { query: null, contactId: "jane", limit: 1, offset: 0 },
    });
    expect(initial.selected).toEqual(jane);
    expect(contactListRequest(initial.filters)).toEqual({ contactId: "jane", limit: 1, offset: 0 });
  });
  it("refreshes the original page and continues from its offset using the same filters", () => {
    const initial = initialPeopleList(output);
    expect(contactListRequest(initial.filters)).toEqual({ query: "Stripe", limit: 10, offset: 20 });
    expect(contactListRequest(initial.filters, 10)).toEqual({
      query: "Stripe",
      limit: 10,
      offset: 30,
    });
  });
  it("does not select a missing contact or discard a contact-write selection", () => {
    expect(
      initialPeopleList({
        ...output,
        contacts: [],
        filters: { query: null, contactId: "missing", limit: 1, offset: 0 },
      }).selected,
    ).toBeNull();
    expect(initialPeopleList({ tab: "people", contact: jane })).toMatchObject({
      selected: jane,
      ready: false,
    });
    expect(initialPeopleList(undefined)).toMatchObject({
      contacts: [],
      selected: null,
      ready: false,
    });
  });
});
