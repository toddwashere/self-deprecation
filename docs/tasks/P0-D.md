# P0-D — People / basic CRM

- Implement contacts and generic notes in a single user-scoped repository; use ToolContext identity exclusively, and scope read/update/delete-by-ID to the caller.
- Register five bounded, local tools with input validation, zod structured outputs, actionable errors, metadata, and natural-language guidance linking add_contact → add_note.
- Replace the People placeholder with searchable contacts, selected-contact details, newest-first notes, add forms, follow-up editing, and ChatGPT outreach handoff. Use only Bridge and shared UI components, with loading/empty/error/saving states and live tool-output refresh.
- Keep public-safe data and literal labels; keep one light joke in feature copy. No external API calls or server generation.

Files: `src/features/crm/{index.ts,repo.ts,tools.ts,panel.tsx,copy.ts,panel.css,panel-state.ts,panel-state.test.ts,repo.test.ts,tools.test.ts}` and this brief.

Tool contracts (all objects omit userId):
- `add_contact`: name + optional company/title/email/linkedinUrl/whereMet/tags/lastContactedAt/followUpAt → `{tab:'people',contact}`.
- `update_contact`: contactId + partial contact fields, nullable optional fields clear values → `{tab:'people',contact}`.
- `list_contacts`: query?, contactId?, limit? (default 50, max 100), offset? → `{tab:'people',contacts,hasMore,filters:{query,contactId,limit,offset}}`.
- `add_note`: subjectType (contact/company/job/event/general), subjectId?, subjectLabel?, kind?, title?, body → `{tab:'people',note}`. Verify contact ownership before attaching.
- `list_notes`: subjectType?, subjectId?, subjectLabel?, limit?, offset? → `{tab:'people',notes,hasMore}`. Notes support saved prep/intel kinds on read without narrowing shared storage.
- Contact/note objects expose all useful fields and timestamps, excluding userId and extra.

Tests (TDD): T1 shared isolation helper for contact and note list/update/delete plus attachment ownership; T4 successful outputs match declared schemas, bounded/invalid input, unknown IDs, generic notes, partial update/clear/search/pagination, metadata. UI is manually rendered per §29.2; Inspector valid/invalid calls plus full typecheck/lint/tests.

Questions: [local] Use epoch milliseconds for timestamps; date form uses local midnight. [local] Literal substring search across name/company/title/whereMet/tags/email, ordered alphabetically. [contract] Integrator updates frozen central registry snapshot and docs/TOOLS.md for the five tool names. Deployment/ChatGPT connection and final natural-language eval are integration checks.

Verification: observed original CRM failures, then review regressions fail for foreign-event attachment, absent normalized filters, and discarded initial/search/contact/page state. Final CRM tests: 14 pass, including T1 event ownership and four extracted-state regressions. Final Vite build, typecheck, and lint pass. Full suite: 41 pass; sole failure remains the frozen registry tool-name snapshot. Inspector passed all five tools with valid/invalid inputs (`/private/tmp/p0d-inspector-smoke.json`); review rerun confirmed foreign/missing event NOT_FOUND, owner event/external-label success, and normalized filters (`/private/tmp/p0d-review-inspector.json`). Browser verified original states plus initial filtered-page preservation, query/offset retention on refresh/continuation, and contactId selection/refresh. Screenshots: `/private/tmp/p0d-people-{populated,dark,empty,error,loading,saving,search,filtered,contact-filter}.png`. Temporary harness removed. Known gaps: integrator-owned snapshot/catalog/embed rebuild, deploy/ChatGPT evaluation, and review recheck.
