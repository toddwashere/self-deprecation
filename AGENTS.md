# AGENTS.md — rules for every coding agent

You may be Codex, Claude Code, or another model. These rules are the same for all of you.

## Start here

1. Read this file, then `docs/PLAN.md` (at least §3, §7, §8, §24, and your task in §17).
2. You own exactly one task ID (e.g. `P0-C`). Its **Owns** paths in PLAN §17/§18 are the only paths
   you edit. If you need a change elsewhere, stop and write a request in `docs/decisions-log.md`.
3. Work on branch `task/<ID>-<slug>` (a git worktree if others run in parallel).

## Before you code: write a task brief

Write `docs/tasks/<ID>.md` (≤ 1 page) per PLAN §26.1: approach, files, tool shapes, tests, and open
questions tagged `[contract]` / `[product]` / `[local]`. Decide `[local]` yourself and keep going.
Escalate `[contract]` via `docs/decisions-log.md`; ask Todd about `[product]` with a recommended
default (take the default after 15 minutes). Commit the brief first.

## Commit often

- Commit after every meaningful, working step (a tool works, a test passes, a tab renders), at
  least every ~30 minutes. Never sit on a large uncommitted diff.
- Conventional messages scoped by task: `feat(P0-C): rank jobs by Decisions fit score`,
  `fix(P0-A): skip Lever boards that 404`, `docs(F1): record McpAgent decision`.
- Each commit should typecheck. Don't commit secrets, `.dev.vars`, or generated junk.
- Push your branch when the task's Done-when is met (or at milestones) so the integrator can merge.

## Hard rules

- **Frozen after Foundation (F9):** `src/db/schema.ts`, `migrations/`, `src/mcp/*`,
  `src/sources/types.ts`, `src/sources/registry.ts`, `web/src/bridge.ts`, `web/src/tabs.ts`,
  `web/src/ui/*`, `web/src/copy.ts`. Don't edit them; request changes via `docs/decisions-log.md`.
- **User isolation:** `userId` comes only from `ToolContext` (verified OAuth props). Never accept a
  user ID as a tool argument. Every query on a user-scoped table filters by `user_id`, including
  updates and deletes by ID. Add an isolation test (user A writes, user B reads nothing).
- **Data access only through your feature's `repo.ts`.** No raw SQL or `db` usage in tool handlers.
- **Tool results:** use `ok(text, structured)` / `fail(code, message, hint)` from `src/mcp/result.ts`.
  Define the `structured` shape as a zod schema in your `tools.ts`; the panel imports its type.
- **Panel code** talks to the server only via `web/src/bridge.ts`. No direct network calls, no
  third-party scripts.
- **Secrets:** never commit keys, tokens, `.dev.vars`, real contact data, or real resume text. The
  repo is public.
- **No PII in logs:** never log resume text, note bodies, emails, or tokens.
- **AI cost:** ChatGPT (via skills + tool results) does generation. Our server calls OpenAI only
  through `src/lib/decisions.ts` (and the optional dossier feature), respecting caps in `api_usage`.
- **Failure handling is a feature:** every external call has a timeout and a graceful fallback, and
  the panel shows loading, empty, and error states.
- **Mark unknowns.** If the plan says VERIFY, check current docs before coding against it and record
  the answer in `docs/decisions-log.md`.

## Status and progress (see PLAN §27)

Every tool sets `status.invoking` / `status.invoked` (≤ 64 chars, §24 voice). No tool blocks longer
than ~8s: return what's ready plus a `progress` object, and let the panel poll `get_task_status`.
Every panel view has loading, empty, error, and in-progress states.

## Voice (see PLAN §24)

Gallows humor about being deprecated, then hope. Humor goes in chrome (subtitles, loaders, empty
states, confirmations, skill intros), never in data. Joke first, hope last. Never mock the user.
Drop the jokes when the user shares something hard. Labels and buttons stay literal. Put your
feature's strings in `src/features/<f>/copy.ts`.

## Definition of done (every task)

- `npm run typecheck`, `npm run lint`, and `npm test` pass.
- You added the tests PLAN §29 assigns to your task (keep it minimal; T1 isolation is mandatory if
  you touch user data). Don't add tests outside §29 unless fixing a regression there.
- New tools are callable in MCP Inspector locally (`DEV_AUTH_BYPASS=1`) with valid and invalid input.
- Tool descriptions say what the tool does, when to use it, when not to, and the next step.
- Your panel tab renders with `seed/demo-todd.json` data, including empty and error states.
- `docs/TOOLS.md` lists your tools; anything you couldn't finish is listed under "Known gaps" in your PR.
- Deployed and checked in ChatGPT (refresh the plugin connection, new chat) when your task touches
  tools or UI.

## Handy commands (created in F1)

`npm run dev` · `npm run build` · `npm run deploy` · `npm run typecheck` · `npm test` ·
`npm run db:migrate:local` · `npm run db:reset:local` · `npm run seed:local` ·
`npx @modelcontextprotocol/inspector@latest` · `npx wrangler tail`
