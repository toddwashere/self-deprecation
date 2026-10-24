# P1-H — AI-Native Ladder

## Approach

Build the ladder as one user-scoped feature with a deterministic heuristic baseline and a typed Decisions upgrade. Eight compact assessment answers become five 0–4 dimension scores, a 1–5 level, level probabilities, three next-level quests, and history. Persist the exact answers and derived result so the panel never needs to recompute personal data. Keep the experience practical: current level, gaps, quests, evidence, reassessment, and a ChatGPT planning handoff.

## Files

- `src/features/ladder/quests.ts`: static, level-targeted quest catalog.
- `src/features/ladder/service.ts`: input normalization, T8 heuristic, Decisions request/result mapping, fallback.
- `src/features/ladder/repo.ts`: all `ladder_assessments` / `ladder_quests` reads and writes, always scoped by `user_id`.
- `src/features/ladder/tools.ts`, `index.ts`: `assess_ai_level`, `get_ladder`, `update_quest` contracts and handlers.
- `src/features/ladder/copy.ts`, `panel.tsx`, `panel.css`: Level view and loading/empty/error/saving states.
- `skills/level-up/SKILL.md`: eight-question conversational assessment and plan handoff.
- `src/features/ladder/*.test.ts`: T1 isolation and T8 heuristic/contract coverage.

## Tool shapes

- `assess_ai_level({ tooling, delegation, verification, parallelism, automation, specification, review, workflow? })` → `{ tab:'level', assessment, quests, history, fallback }`.
- `get_ladder({})` → `{ tab:'level', assessment|null, quests, history }`.
- `update_quest({ questId, status, evidence? })` → `{ tab:'level', assessment, quests, history }`; fails when no assessment or the quest is not in the caller’s active catalog.

All mutation identity comes from `ToolContext`; tool handlers use only `repo.ts`; results use `ok` / `fail`; tool copy includes when to use, when not to use, and next step.

## Tests

- T8 table-driven heuristic with hand-derived dimension scores and level boundaries.
- T1: user B cannot read or mutate user A’s assessment or quest, including update by ID.
- Tool success/fallback, invalid quest, exact output-schema validation, and Decisions mapping with a feature-local injected adapter.
- Manual Inspector valid/invalid calls and panel seed/empty/error/saving states.

## Open questions

- `[contract]` The shared `src/lib/decisions.ts` wrapper exposes only job-fit score/predicate requests. Integrator must add a bounded ladder assessment export (choice + five score questions, ≤6s, usage metering) or explicitly authorize P1-H to patch that wrapper; this branch will not call OpenAI directly.
- `[contract]` Integrator must add the three tool names to the frozen registry snapshot, document them in `docs/TOOLS.md`, enable Level through the chosen secondary navigation, rebuild the panel, and deploy/check ChatGPT.
- `[local]` Use the PLAN §25 level names and select exactly three deterministic quests for `min(level + 1, 5)`; Level 5 receives maintenance/loop-building quests.
