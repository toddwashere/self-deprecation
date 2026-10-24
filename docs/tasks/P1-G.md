# P1-G — Agents API company dossier

## Approach

Add one bounded open-world tool that researches a company through the current OpenAI Agents API, using live web search and a strict structured-output schema. Reserve quota atomically before the network call (maximum three attempts per user per UTC day plus a global daily cap), cap the hosted session at 10 USD cents, abort local waiting after 6.5 seconds, and save only a completed dossier as a caller-owned `notes.kind='dossier'` row. Timeout, missing key/access, refusal, and API failure return a typed completed fallback rather than implying background work.

Official docs verified 2026-10-24: `POST /v1/agents/sessions`; JavaScript `client.beta.agents.sessions.create`; `environment:{type:'none'}`; `tools:[{type:'web_search',mode:'live'}]`; `agent.text.format` JSON Schema; streaming `finalResult()`; required key permissions `api.agents.read`, `api.agents.write`, and `api.responses.write`.

## Files

- Replace `src/features/dossier/index.ts`; add `agent.ts`, `copy.ts`, `repo.ts`, `tools.ts`.
- Add `agent.test.ts`, `repo.test.ts`, and `tools.test.ts` beside the feature.
- Append verified API findings and the central registry/docs/deploy request to `docs/decisions-log.md`.

## Tool shape

- `run_company_dossier({ company, website? })` → `{ tab:'people', status:'complete'|'unavailable'|'rate_limited'|'disabled', company, dossier, noteId, progress:{stage:'done',done,total} }`.
- Completed dossier: summary, recent news with URLs, engineering stack/culture signals with evidence/source URLs, role types to contact (never scraped people), source list, and `researchedAt`.

## Tests

- T1: user B cannot list/read user A's dossier; quota accounting is isolated while the global cap is shared.
- Atomic daily quota: fourth user attempt and the global overflow never call the runner.
- Request contract: live web search, strict structured output, `environment:none`, spend control, and bounded abort signal.
- Tool contract: valid success persists one dossier; invalid input, timeout/failure, disabled mode, and caps return bounded typed results with no accidental note.

## Open questions

- `[local]` Default global cap: 100 attempts/day; `AGENTS_GLOBAL_DAILY_CAP` may lower or raise it to 10,000. Per-user cap is never above three.
- `[local]` A failed external attempt still consumes quota because it may incur cost; disabling the feature does not.
- `[contract]` Integrator must add the tool name to the frozen registry snapshot and `docs/TOOLS.md`, rebuild the panel, deploy, and verify the production key has the three Agents scopes.
- `[product]` Default: surface saved dossiers in People/company notes; do not add another top-level tab.
