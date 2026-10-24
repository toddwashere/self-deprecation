# P1-B — Events

## Approach
- Persist caller-owned events; ChatGPT discovers events through web search and supplies verified dates, locations, and sources.
- Enrich a pasted URL with a title only when possible, using an explicit public event-host allowlist, a short timeout, redirect refusal, and a size cap. Saving still works if metadata is unavailable.
- Render upcoming, past, and undated events with literal status actions through the shared bridge. Keep loading, empty, error, and saving states visible.
- Keep the existing frozen navigation disabled for integrator enablement; register tools in the owned Events feature entry point.

## Files
`src/features/events/{index.ts,tools.ts,repo.ts,service.ts,copy.ts,panel.tsx,tools.test.ts}` and `skills/find-events/SKILL.md`.

## Tools and outputs
- `save_event`: optional title/public HTTPS URL, optional epoch-ms startsAt/endsAt, venue/city/notes, source enum, status enum. Requires title or URL; end cannot precede start. Returns `{tab:'events',event,metadata:{status:'enriched'|'unavailable'|'not_requested'}}`.
- `list_events`: optional period (`all|upcoming|past|undated`), status and limit (1–100). Returns `{tab:'events',events,asOf,progress:{stage:'done',done,total}}`.
- `update_event`: eventId plus at least one editable field. Returns `{tab:'events',event}` or `NOT_FOUND` without disclosing another user's row.
- Structured event schema exports the panel type; includes no user ID. All inputs validated with zod, all outputs use ok/fail.

## Verification
TDD: first prove missing save/list/update behavior fails, then implement. T1 shared isolation helper verifies cross-user list, ID read, update, and repository delete-by-ID (no delete tool); T4 checks output/input contracts and invalid input; deterministic metadata fixtures cover bounded fallback (no live network). Full typecheck/lint/test; local Inspector valid/invalid tool calls; seed/empty/error/loading panel visual checks using an isolated preview harness.

## Open questions / local decisions
- [local] Unknown times stay null and render “Date not confirmed”; never infer dates from OG text.
- [local] Metadata enrichment only uses Meetup, Luma, Eventbrite, and lu.ma public hosts; other HTTPS URLs are saved without a server fetch.
- [contract] Integrator owns navigation enablement, shared docs/TOOLS catalog, generated panel rebuild, production deploy, and ChatGPT dry run. No frozen file changes in this branch.

## Evidence / integration rechecks
- Nine Events tests pass, plus the shared HTTP cap regression (10/10 targeted). Verified red→green for Workers manual redirects and 100 past rows hiding a future event. Temporal/status filtering runs before the SQL limit; All orders upcoming, undated, then recent history. Panel filter changes query the server and preserve controls for empty results.
- Integrated central typed-error/stream-cap commits 12c6573/a15379c unchanged. Owned streaming regression confirms early cancellation with saved-facts fallback. Typecheck/lint pass; production panel build 252.57 kB. Full suite: 36/37 pass; only frozen tool-list snapshot needs the three Events names.
- Inspector valid save/filter/update and invalid-input/not-found responses verified; errors use typed `_meta` without success-schema failures. Local bypass needs demo seeding first.
- Seed, filters, light/dark, loading/empty/error, Saving→updated previously verified visually (`/tmp/p1-b-events-dark.png`). Review-fix visual recheck blocked by locked Mac/no browser surface.
- Known gaps: integrator-owned snapshot/catalog, navigation, generated panel embedding, deployment, and real ChatGPT discovery/save dry run.
