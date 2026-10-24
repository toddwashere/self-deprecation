# P0-B — Criteria, resume, and onboarding

## Approach

- Add a user-scoped criteria repository over the frozen `profiles` table; every read/update filters `user_id`, partial updates preserve omitted fields, and every write bumps `criteria_version` once.
- Expose `start_onboarding`, `get_criteria`, `update_criteria`, and `save_resume` with zod result contracts and the shared MCP result helpers.
- Replace the Profile placeholder with a bridge-only panel: empty users choose **Get started** or **See demo**; configured users see a concise summary and can update through chat.
- Package `skills/onboarding/SKILL.md`; server instructions added during F9 provide the same trigger guidance for direct custom-MCP installations.

## Files

- `src/features/criteria/{repo,tools,tools.test,index,panel,copy}.ts(x)`
- `skills/onboarding/SKILL.md`
- `docs/TOOLS.md`

## Tool shapes

- `start_onboarding {}` → `{configured, criteria, missing[], questionGroups[]}`; read-only, opens Profile.
- `get_criteria {includeResume?}` → normalized criteria plus `hasResume`; resume text is opt-in.
- `update_criteria {partial profile fields}` → updated normalized criteria; caller-scoped.
- `save_resume {text, extracted?}` → updated criteria and resume status; text ≤ 50 KB.

## Tests

- T1: user B cannot read or update user A's profile.
- Partial updates preserve omitted values and increment `criteria_version` once.
- Resume validation rejects text over 50 KB; extraction maps only supplied fields.
- Onboarding reports the intended missing fields and treats headline-only profiles as incomplete.
- Full typecheck, lint, tests, build, production audit, local tool calls, and ChatGPT/Profile visual gate.

## Open questions and rulings

- `[local]` A configured profile requires at least one target title or skill; headline-only remains first-run.
- `[local]` Gather conversational answers in chat, summarize, and confirm before one `update_criteria` call; no persisted draft state.
- `[local]` `search_jobs` is conditional in the skill until P0-C registers it.
- No `[contract]` or `[product]` question blocks implementation.
