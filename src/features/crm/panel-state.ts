import type { Contact, ContactsOutput } from "./tools";
export type ContactListFilters = ContactsOutput["filters"];
export interface PeopleListState {
  contacts: Contact[];
  selected: Contact | null;
  filters: ContactListFilters;
  hasMore: boolean;
  ready: boolean;
}
export function initialPeopleList(output: unknown): PeopleListState {
  const empty: PeopleListState = {
    contacts: [],
    selected: null,
    filters: { query: null, contactId: null, limit: 25, offset: 0 },
    hasMore: false,
    ready: false,
  };
  if (!output || typeof output !== "object" || !("tab" in output) || output.tab !== "people")
    return empty;
  if ("contacts" in output && Array.isArray(output.contacts) && "filters" in output) {
    const page = output as ContactsOutput;
    return {
      contacts: page.contacts,
      selected: page.contacts.find((contact) => contact.id === page.filters.contactId) ?? null,
      filters: page.filters,
      hasMore: page.hasMore,
      ready: true,
    };
  }
  if ("contact" in output) return { ...empty, selected: output.contact as Contact };
  return empty;
}
export function contactListRequest(filters: ContactListFilters, appendedCount = 0) {
  return {
    ...(filters.query ? { query: filters.query } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    limit: filters.limit,
    offset: filters.offset + appendedCount,
  };
}
