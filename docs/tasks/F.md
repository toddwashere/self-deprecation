# Foundation task brief — F1–F8

## Approach

- Keep the proven stateless Streamable HTTP Worker transport and MCP Apps resource from F1.
- F2: wrap `/mcp` with `workers-oauth-provider`, GitHub login, protected-resource and authorization-server discovery, PKCE/resource enforcement, verified grant props, a guarded local bypass, and `get_profile`.
- F3–F4: define the complete Drizzle/D1 schema, migrations and isolation helper, then move MCP registration behind frozen feature/result/registry contracts with shared HTTP/log/error utilities.
- F5–F6: replace the spike HTML with a single-file React panel and host bridge, then implement core profile/dashboard/demo/reset tools through the core repository.
- F7–F8: add the capped Decisions batching/fallback wrapper, then the cron/source contracts and one Greenhouse ingestion path with `fetch_runs` observability.
- F9 feedback: before freezing MCP contracts, make an empty workspace open the Profile onboarding surface and add server guidance so ordinary phrases such as “get started” select the onboarding tools once P0-B lands.
- F9 approved amendment: reserve the `learning_entries` table before the Foundation schema freeze, include caller-owned entries in reset, and leave all Learning Journal tools/UI to P1-I.
- F9 visual-gate repair: bind the shell's `data-theme` value to explicit light/dark `color-scheme` rules so host theme wins over the operating-system preference; rebuild and visually verify both modes before the tag.
- Use strict TDD for T1–T5, commit every working slice, deploy/push at milestones, and stop before F9 for the shared gate review.

## Files

- Auth/runtime: `src/index.ts`, `src/env.ts`, `src/auth/*`, `src/mcp/*`, `wrangler.jsonc`, `.dev.vars.example`.
- Data: `src/db/*`, `migrations/*`, `drizzle.config.ts`, `scripts/{db-reset,seed}.ts`, test helpers.
- Contracts/sources: `src/lib/*`, `src/sources/*`, `src/cron/*`, feature stubs under `src/features/*`.
- Product shell: `web/*`, `src/features/core/*`, `seed/demo-todd.json`, `docs/TOOLS.md`.
- Decisions/smoke: `src/lib/decisions.ts`, `scripts/smoke-decisions.ts`; package/config/docs updates required by those files.

## Tool and panel contracts

- `get_profile`: `{}` → `{ id, name, email?, nickname? }`; read-only; `openai/profile` metadata.
- `open_dashboard`: `{ tab? }` → dashboard state; read-only; opens the shared panel.
- With no explicit tab, `open_dashboard` opens Profile for an empty criteria record and Today for a configured profile.
- `reset_my_data`: `{ confirm: literal("RESET") }` → `{ reset: true }`; destructive and caller-scoped.
- `load_demo_data`: `{}` → inserted/updated counts; idempotent and caller-scoped.
- `get_task_status`: `{ taskId }` → `{ stage, done, total }`; read-only.
- Panel has loading, empty, error, success and in-progress states; all server calls go through `web/src/bridge.ts`.
- The shared shell applies the host-reported theme deterministically through its existing `data-theme` attribute.

## Tests and checks

- F2/T3: verified grant is the only user-ID source; forged `userId` input is rejected/ignored; production bypass fails closed; anonymous production `/mcp` returns a PRM challenge; local bypass works.
- F3/T1: real D1 fixtures prove user A data is unreadable/unmodifiable/undeletable by user B; local and remote migrations apply.
- F9/T1: journal reservation is caller-scoped and reset deletes only the caller's learning entries.
- F4/T4: snapshot every tool contract, annotations, security scheme, status length, unique snake_case name, and output validation.
- F6/T2: reset affects only the caller and leaves global rows; demo load is idempotent.
- F7/T5: literal fixtures cover batching, answer mapping, 0–4 normalization, cap, and per-batch fallback.
- F8: scheduled Greenhouse fetch inserts jobs and records successful/failed `fetch_runs`; no test calls the network.
- Every milestone runs `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`; tool/UI milestones are deployed and refreshed in a new ChatGPT conversation.
- F9 theme repair: source and embedded CSS contain explicit light/dark shell selectors; the same panel state visibly changes palette when the mock host context changes.

## Open questions and rulings

- `[local]` F2 needs `users` and `auth_identities` before F3. Bootstrap those two tables/schema in F2; F3 extends the same migration series with every remaining §7 table.
- `[local]` F5 precedes the F6 implementations used by its Settings buttons. Ship the bridge/button states in F5; the actions become live and satisfy the combined done condition in F6.
- `[local]` §8.5 labels `decisions.ts` as F8, while §17 and §29 assign it to F7. Follow the explicit work breakdown/testing ownership: F7.
- `[local]` OAuth uses the current provider API with S256, PRM, exact `resource` propagation, DCR/CIMD compatibility, and the ChatGPT management page's redirect URI; trigger R2 only after the 90-minute F2 timebox.
- `[contract]` Approved by Todd: reserve a dedicated Learning Journal table before `foundation-v1`; do not overload generic CRM notes or expose unfinished journal capabilities.
- No `[contract]` or `[product]` question blocks implementation.
