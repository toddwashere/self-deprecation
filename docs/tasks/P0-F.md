# P0-F — Feature integration and demo packaging

## Approach

Assemble only independently reviewed feature branches into one deployable plugin milestone. Preserve feature ownership by cherry-picking their commits; make shared/frozen changes centrally under the approved 2026-10-24 11:32 integration exception. Wire Jobs catalog/user tools and cron, accept feature-owned registrations, update the exact tool-contract snapshot, expose only completed navigation, regenerate the embedded panel, migrate/seed, deploy, then verify production MCP discovery and ChatGPT flows. Integrate in small commits so any feature can be reverted independently.

## Files

- Owned P0-F: `plugin/`, `docs/DEMO.md`, `seed/demo-todd.json`, `scripts/smoke-prod.ts`, this brief.
- Integrator exceptions already recorded: feature `index.ts` seams, `src/cron/dispatcher.ts`, `src/mcp/registry.test.ts`, `web/src/tabs.ts`, shared shell navigation/copy, generated panel, `docs/TOOLS.md`, and `docs/decisions-log.md`.
- Feature files arrive unchanged from reviewed P0-A/C/D/E and P1-B/C branches.

## Tool and UI wiring

- Jobs: register `catalogTools` plus `jobsTools`; connect rotating job batch to the existing jobs cron.
- News, Events, People, Prep: retain feature-owned `index.ts` registrations.
- Tool result contracts remain feature-owned zod schemas using `ok`/`fail`; no user ID arguments.
- Primary navigation shows completed frequent workflows only. News and Events become available; unfinished Today/Money/Growth surfaces stay hidden until their tasks land. The broader Learn grouping remains a follow-up shell change if it cannot be made without weakening current tab routing.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Update T4 exact tool snapshot and validate every registered tool's metadata.
- Local Inspector: valid and invalid calls for newly wired tools; local scheduled job/news runs.
- Production: migrate if needed, deploy once per integrated milestone, run `smoke:prod`, refresh ChatGPT plugin/new chat, verify Jobs ranking/fallback, News, Events, Prep, and People when merged.

## Open questions

- `[local]` Resolve cherry-pick conflicts by preserving the latest reviewed feature behavior and append-only decision entries.
- `[contract]` Daily active-user Adzuna sweep lacks an activity query contract; ship bounded on-demand Adzuna refresh first and keep the scheduled sweep logged.
- `[product]` Default: do not expose unfinished Money/Level as primary navigation. Keep the approved Learn grouping as the next centralized shell milestone after the feature tabs are stable.
