# P1-D — Daily brief / Today

## Approach
- Assemble bounded stored-table reads in the brief repository; never fetch feeds or score jobs while building the brief.
- Show up to five new, current-criteria matches, five contract leads, upcoming saved events, due follow-ups, and five recent headlines; isolate each section failure.
- Use the last successful view watermark and mark only the snapshot the user actually read, so arrivals during a brief remain new.
- Render Today through the bridge with loading, empty, partial-error, and in-progress states. Hand off “Run my brief” to ChatGPT.
- Teach the daily-brief skill to produce a concise cited brief, then mark it seen, and offer scheduling with a manual fallback.

## Files
`src/features/brief/{index.ts,repo.ts,tools.ts,copy.ts,panel.tsx,brief.test.ts}`;
`skills/daily-brief/SKILL.md`; this brief. Shared docs changes go to the integrator.

## Tool contracts / states
- `get_brief_data({})`: `{tab:'today', asOf, lastSeenAt:number|null, timezone, needsCriteria, matches:Match[], contractLeads:Match[], events:Event[], followUps:FollowUp[], headlines:Headline[], unavailable:string[], progress:{stage:'done'|'scoring',done,total,taskId?}}`.
- `mark_brief_seen({asOf:nonnegative epoch ms})`: `{tab:'today', lastSeenAt}`; reject future timestamps and advance monotonically.
- No input accepts user IDs. Outputs defined with zod in tools.ts. Every tool has annotations/status and short summaries.
- Panel states: initial loader; section empty messages; retryable error; stored-ready sections remain visible during scoring and partial availability.

## Tests
Strict red → green: T1 reads/watermark isolation for users A/B; deterministic ranking, cutoff/limits, current criteria, contract selection, upcoming/due filters, five headlines; monotonic seen watermark; invalid inputs/output schemas; partial-section failure and scoring progress. Run typecheck, lint, full tests, build; Inspector valid/invalid calls; seed/empty/error/in-progress visual checks.

## Open questions
- [local] New matches use `scored_at > lastSeenAt` (or updated_at when unscored), status new, current criteria version; first run includes all stored current matches.
- [local] Limit each section to five; events cover the next 30 days, contacts include all overdue follow-ups; headlines are latest stored items since last seen.
- [contract] Integrator updates docs/TOOLS.md and handles deployment/ChatGPT check; no shared frozen files need editing.
