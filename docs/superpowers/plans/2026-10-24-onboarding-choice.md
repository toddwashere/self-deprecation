# Onboarding Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give first-time users an obvious Demo-or-Setup choice and a reliable conversational path that persists isolated job-search criteria.

**Architecture:** Foundation makes one pre-freeze routing/instructions adjustment. P0-B owns a criteria repository, four focused tools, the Profile panel, feature copy, and the onboarding skill; the panel starts chat through the existing bridge and never calls the network directly.

**Tech Stack:** TypeScript, Cloudflare Workers/D1, Drizzle, MCP SDK, zod, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-onboarding-choice-design.md`

## Global Constraints

- User IDs come only from `ToolContext`; every profile query/update filters `user_id`.
- Resume text is ≤ 50 KB and never logged.
- Tools use `ok`/`fail`, define zod outputs, carry all required annotations and ≤64-character statuses.
- Panel calls only `web/src/bridge.ts` and renders loading, empty, error, and configured states.
- Humor stays in chrome; labels/buttons remain literal.

## Review Focus

- An explicit dashboard tab must never be overridden by first-run routing.
- A headline-only or partially completed profile must still count as incomplete until target titles or skills exist.
- Empty arrays and omitted partial-update fields must not erase unrelated saved criteria.
- Resume extraction must not overwrite fields the user did not supply.
- Demo loading from the empty state must refresh to the configured summary or show a useful error.

---

### Task 1: Foundation first-run routing and server guidance

**Files:**
- Modify: `src/features/core/repo.ts`
- Modify: `src/features/core/tools.ts`
- Modify: `src/features/core/tools.test.ts`
- Modify: `src/mcp/server.ts`

**Interfaces:**
- Produces: `hasJobCriteria(db: DB, userId: string): Promise<boolean>` and default Profile routing for empty users.
- Produces: MCP server instructions naming the future criteria tools without changing the registry contract.

- [ ] Write a failing core tool test: no criteria defaults to `tab: "profile"`; configured criteria defaults to `tab: "today"`; explicit `tab: "settings"` wins.
- [ ] Run `npm test -- src/features/core/tools.test.ts` and confirm the empty-user assertion fails.
- [ ] Implement `hasJobCriteria` and route only omitted tabs from `open_dashboard`.
- [ ] Add concise server instructions for “get started” and `NEEDS_CRITERIA` flows.
- [ ] Run the focused test, typecheck, lint, commit, and push `task/F-foundation`.

### Task 2: Isolated criteria repository and tools

**Files:**
- Create: `docs/tasks/P0-B.md`
- Create: `src/features/criteria/repo.ts`
- Create: `src/features/criteria/tools.test.ts`
- Create: `src/features/criteria/tools.ts`
- Modify: `src/features/criteria/index.ts`
- Modify: `docs/TOOLS.md`

**Interfaces:**
- Produces: `getCriteria`, `updateCriteria`, and `saveResume` repository functions scoped by `userId`.
- Produces tools: `start_onboarding`, `get_criteria`, `update_criteria`, `save_resume`.

- [ ] On branch `task/P0-B-onboarding`, write and commit the ≤1-page task brief before code.
- [ ] Write failing D1 tests for cross-user read/update isolation, partial update preservation, criteria-version bump, resume-size rejection, and onboarding missing fields.
- [ ] Run `npm test -- src/features/criteria/tools.test.ts` and confirm failure from missing implementations.
- [ ] Implement the minimal repository and tool schemas/handlers; update the feature index and tool docs.
- [ ] Run focused tests and the registry contract test; commit and push.

### Task 3: Profile choice UI and onboarding skill

**Files:**
- Create: `src/features/criteria/copy.ts`
- Modify: `src/features/criteria/panel.tsx`
- Create: `skills/onboarding/SKILL.md`

**Interfaces:**
- Consumes: the four Task 2 tools and existing `load_demo_data`/`Bridge.sendPrompt`.
- Produces: Profile states for loading, error, empty choice, busy demo load, and configured summary.

- [ ] Implement the Profile panel with **Get started** and **See demo**; keep all strings in `copy.ts`.
- [ ] Write the onboarding skill from PLAN Appendix B, adding summary confirmation and an “if available” guard around future `search_jobs`.
- [ ] Run typecheck, lint, all tests, build, and production dependency audit.
- [ ] Verify the panel visually with empty and demo data, deploy, refresh the ChatGPT plugin, and run the F9/onboarding gate.
- [ ] Commit and push; leave `foundation-v1` untagged until Todd confirms the shared gate.
