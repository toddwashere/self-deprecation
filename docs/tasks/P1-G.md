# P1-G — Agents API company dossier

## Approach

Add one bounded open-world tool that researches a company through the current OpenAI Agents API, using live web search and a strict structured-output schema. Reserve quota atomically before the first network call (maximum three attempts per user per UTC day plus a global daily cap), start the hosted session in under four seconds, and return a caller-owned task ID. Repeating the tool with that ID polls without charging another run; only a completed dossier is saved as a caller-owned `notes.kind='dossier'` row. Failures return a typed fallback without pretending work continues.

Official docs verified 2026-10-24: `POST /v1/agents/sessions`; JavaScript `client.beta.agents.sessions.create`; `environment:{type:'none'}`; `tools:[{type:'web_search',mode:'live'}]`; `agent.text.format` JSON Schema; streaming `finalResult()`; required key permissions `api.agents.read`, `api.agents.write`, and `api.responses.write`.

## Files

- Replace `src/features/dossier/index.ts`; add `agent.ts`, `copy.ts`, `repo.ts`, `tools.ts`.
- Add `agent.test.ts`, `repo.test.ts`, and `tools.test.ts` beside the feature.
- Append verified API findings and the central registry/docs/deploy request to `docs/decisions-log.md`.

## Tool shape

- `run_company_dossier({ company, website? } | { taskId })` → `{ tab:'people', status:'researching'|'complete'|'unavailable'|'rate_limited'|'disabled', company, dossier, noteId, taskId, progress }`.
- Completed dossier: summary, recent news with URLs, engineering stack/culture signals with evidence/source URLs, role types to contact (never scraped people), source list, and `researchedAt`.

## Tests

- T1: user B cannot list/read user A's dossier; quota accounting is isolated while the global cap is shared.
- Atomic daily quota: fourth user attempt and the global overflow never call the runner.
- Request contract: live web search, strict structured output, `environment:none`, documented spend control with a live-beta compatibility retry, asynchronous start/poll, and bounded abort signals.
- Tool contract: valid success persists one dossier; invalid input, timeout/failure, disabled mode, and caps return bounded typed results with no accidental note.

## Open questions

- `[local]` Default global cap: 100 attempts/day; `AGENTS_GLOBAL_DAILY_CAP` may lower or raise it to 10,000. Per-user cap is never above three.
- `[local]` A failed external attempt still consumes quota because it may incur cost; disabling the feature does not.
- `[contract]` Integrator must add the tool name to the frozen registry snapshot and `docs/TOOLS.md`, rebuild the panel, deploy, and verify the production key has the three Agents scopes.
- `[product]` Default: surface saved dossiers in People/company notes; do not add another top-level tab.
