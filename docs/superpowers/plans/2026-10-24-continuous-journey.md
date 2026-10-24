# Continuous Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a useful first-run and presenter tour built around Orient → Focus → Move → Evolve, while reserving the pre-freeze Learning Journal data contract.

**Architecture:** Reserve `learning_entries` in the Foundation schema without exposing unfinished tools. Keep the shipped journey entirely inside the P0-B criteria feature: a read-only tour tool opens Profile, focused feature components render the tour and recurring journey card, and all actions use the existing bridge and tools.

**Tech Stack:** TypeScript, React, zod, Drizzle/D1, MCP Apps, Vitest/Cloudflare Workers, Biome, Vite, Wrangler

**Spec:** `docs/superpowers/specs/2026-10-24-continuous-journey-design.md`

## Global Constraints

- Follow `AGENTS.md`; user IDs come only from `ToolContext`, and every user row is isolated by `user_id`.
- Humor lives in feature chrome, one quip per screen at most; difficult personal context suppresses it.
- Labels and buttons remain literal; every screen ends with utility or hope.
- Panel server access goes only through `web/src/bridge.ts`; do not change frozen registry or tab contracts.
- The tour is optional, read-only, local panel state and never marks onboarding complete.
- `learning_entries` is schema reservation only; no Learning Journal tool or UI ships in this plan.
- Commit every working task and push each milestone.

## Review Focus

- A configured user invokes the tour: open the tour without deleting or changing criteria; Task 2 test pins unchanged `criteriaVersion`.
- A user closes/skips the tour: return to their correct empty or configured Profile state; Task 3 visual matrix covers both.
- The panel receives the tour tool result after mounting: use `bridge.initialToolOutput()` after Profile routing and verify through MCP Inspector in Task 4.
- Demo loading fails or returns no profile: preserve the existing explicit error state and do not report success; Task 3 review exercises the error path.
- Reset runs after future journal data exists: delete only the caller's journal entries and preserve another user's entries; Task 1 test pins isolation.

---

### Task 1: Reserve the Learning Journal contract before Foundation freeze

**Files:**
- Modify: `docs/tasks/F.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/decisions-log.md`
- Modify: `src/db/schema.ts`
- Create: `migrations/0003_learning_entries.sql`
- Modify: `src/db/schema.test.ts`
- Modify: `src/features/core/repo.ts`
- Modify: `src/features/core/tools.test.ts`
- Modify: `scripts/db-reset.ts`

**Interfaces:**
- Consumes: existing `users`, `saved_events`, timestamp helpers, and caller-scoped reset repository.
- Produces: exported `learningEntries` Drizzle table and D1 table `learning_entries`; no MCP tool.

- [ ] **Step 1: Update the Foundation brief before code**

Add the approved F9 amendment: reserve `learning_entries`, include it in reset, and assign future tools/UI to P1-I. Commit `docs(F9): reserve learning journal contract`.

- [ ] **Step 2: Write failing schema and reset tests**

Extend the frozen-table assertion with `learning_entries`. In the core reset test, insert one entry for user A and one for user B, call `reset_my_data` as A, and assert A has zero entries while B retains one.

- [ ] **Step 3: Run tests to verify RED**

Run: `npm test -- --run src/db/schema.test.ts src/features/core/tools.test.ts`

Expected: FAIL because `learningEntries`/`learning_entries` do not exist.

- [ ] **Step 4: Add the Drizzle and SQL contract**

Define `learningEntries` with exact columns: `id`, `userId` (cascade FK), `kind` (default `reference`), required `title`, nullable `body`, `sourceUrl`, `sourceTitle`, `author`, nullable `eventId` (`saved_events`, set null), nullable `occurredAt`, JSON string arrays `tags`, `takeaways`, `followUpQuestions`, `nextActions` (all default `[]`), booleans `pinned`/`archived` (both default false), and timestamps. Add indexes `(user_id, occurred_at)`, `(user_id, kind)`, and `(user_id, pinned)`. Mirror it in `0003_learning_entries.sql`.

- [ ] **Step 5: Make lifecycle commands aware of the table**

Export it through `schema`/`schemaTableNames`, delete caller rows in `resetUserData`, and drop it before parents in `scripts/db-reset.ts`.

- [ ] **Step 6: Update the plan and decision log**

Add P1-I ownership of `src/features/learning/*` and `skills/learning-journal/`, the planned tool names, and the pre-freeze contract rationale. Do not claim the journal UI is implemented.

- [ ] **Step 7: Verify GREEN and migrations**

Run: `npm test -- --run src/db/schema.test.ts src/features/core/tools.test.ts`, `npm run typecheck`, `npm run lint`, `npm run db:reset:local`, then `npm run db:migrate:prod`.

Expected: tests pass; local reset applies migrations 0001–0003; production applies 0003 once.

- [ ] **Step 8: Commit and push Foundation milestone**

Commit `feat(F9): reserve learning journal schema` on `task/F-foundation`, push, then rebase `task/P0-B-onboarding` onto it.

### Task 2: Add the read-only product tour tool

**Files:**
- Modify: `docs/tasks/P0-B.md`
- Modify: `src/features/criteria/tools.ts`
- Modify: `src/features/criteria/tools.test.ts`
- Modify: `src/mcp/registry.test.ts`
- Modify: `docs/TOOLS.md`

**Interfaces:**
- Consumes: `getCriteria(db, userId)` and the shared `ToolDef` registration path.
- Produces: `show_product_tour {}` → `{ tab: "profile", mode: "tour", configured: boolean }`.

- [ ] **Step 1: Extend and commit the P0-B task brief**

Document the approved tour, journey card, exact paths, tests, and `[local]` state rulings. Commit `docs(P0-B): brief continuous journey work` before code.

- [ ] **Step 2: Write the failing tour test**

Seed configured criteria, capture the row, call `show_product_tour`, and assert `tab`, `mode`, `configured: true`, read-only annotations, and an unchanged criteria row/version. Update the registry snapshot expectation.

- [ ] **Step 3: Run tests to verify RED**

Run: `npm test -- --run src/features/criteria/tools.test.ts src/mcp/registry.test.ts`

Expected: FAIL because `show_product_tour` is absent.

- [ ] **Step 4: Implement the tool contract**

Add zod output schema and a tool description containing what/when/not/next guidance. Set required annotations to read-only/non-destructive/closed-world, statuses ≤64 characters, `opensPanel: true`, and return `ok()` with no write.

- [ ] **Step 5: Document and verify GREEN**

Add the tool to `docs/TOOLS.md`. Run the focused tests, `npm run typecheck`, and `npm run lint`.

- [ ] **Step 6: Commit and push**

Commit `feat(P0-B): add read-only product tour tool` and push.

### Task 3: Build first-run tour and recurring journey UI

**Files:**
- Create: `src/features/criteria/tour.tsx`
- Create: `src/features/criteria/journey.tsx`
- Modify: `src/features/criteria/copy.ts`
- Modify: `src/features/criteria/panel.tsx`
- Modify: `skills/onboarding/SKILL.md`
- Regenerate: `src/mcp/panel-html.generated.ts`

**Interfaces:**
- Consumes: `show_product_tour` output mode, `CriteriaOutput`, `Bridge.callTool`, and `Bridge.sendPrompt`.
- Produces: `TourPanel` and `JourneyCard`, used only by `ProfilePanel`.

- [ ] **Step 1: Define feature copy and tour data**

Add the approved thesis, four step headings/bodies/quip/hope lines, compact technical reveal on the final Evolve step, button labels, recurring summaries, review prompt, loading/error text, and planned labels to `copy.ts`. Keep every user-visible criteria string there.

- [ ] **Step 2: Implement `TourPanel`**

Signature: `TourPanel({ configured, onGetStarted, onDemo, onClose })`. Render one of four steps with accessible heading/focus target, Back/Next/Skip, and final Set up my search/Explore demo actions. No persistence or server calls inside the component.

- [ ] **Step 3: Implement `JourneyCard`**

Signature: `JourneyCard({ criteria, onOpenTab, onReview })`. Render Orient/Focus/Move/Evolve summaries, mark exactly one deterministic recommendation, route literal actions through callbacks, and label unavailable future capabilities Planned.

- [ ] **Step 4: Integrate both states into `ProfilePanel`**

Initialize tour mode from `bridge.initialToolOutput<{ mode?: string }>()`, add Quick tour to empty first run, preserve Get started/See demo behavior, return correctly from Skip/Close, show JourneyCard above the configured form, route tabs via `open_dashboard`, and send the review prompt through the bridge.

- [ ] **Step 5: Update onboarding skill guidance**

When asked what the product does or for a tour, call `show_product_tour`; do not start or modify onboarding criteria. Preserve the difficult-context humor rule.

- [ ] **Step 6: Build and visually inspect the matrix**

Run `npm run build:web`, then use local MCP Inspector to verify empty opening, all four tour steps, skip-to-empty, configured invocation, close-to-configured, demo failure, light/dark theme, and narrow width. Confirm generated HTML remains under 400 KB gzip.

- [ ] **Step 7: Commit and push**

Commit `feat(P0-B): add continuous journey tour` and push.

### Task 4: Full verification and production deployment

**Files:**
- Update generated panel only if Task 3 build changed it.
- Update: `.superpowers/sdd/.../progress.md` (ignored execution ledger only).

**Interfaces:**
- Consumes: Tasks 1–3 completed and pushed.
- Produces: deployed production version and a remaining human ChatGPT interaction gate.

- [ ] **Step 1: Run full local gate**

Run: `git diff --check && npm run lint && npm run typecheck && npm test && npm run build && npm audit --omit=dev`.

Expected: zero lint/type/build errors, all tests pass, zero production vulnerabilities.

- [ ] **Step 2: Validate MCP locally**

Start `npm run dev -- --port 8791`. Use strict MCP Inspector for `tools/list`; call `show_product_tour` with `{}` and call one criteria tool with invalid input. Verify zero schema errors and `text/html;profile=mcp-app` app metadata.

- [ ] **Step 3: Self-review against the spec**

Review the complete branch diff for ownership, isolation, accurate planned labels, copy density, no direct network calls, and no user-authored content in humorous strings. Fix findings and rerun affected gates.

- [ ] **Step 4: Deploy and smoke production**

Run `npm run deploy`. Verify `/` health, protected-resource metadata, unauthenticated `/mcp` returns `401`, and record the Wrangler version ID.

- [ ] **Step 5: Commit/push any final generated change and stop at ChatGPT gate**

Keep `task/P0-B-onboarding` pushed. Do not merge or tag `foundation-v1`. Ask the user to refresh the plugin in a new chat and verify “Show me what Self-Deprecation does,” Get started, See demo, and configured return.
