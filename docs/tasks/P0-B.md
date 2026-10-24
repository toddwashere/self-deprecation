# P0-B — Criteria, resume, and onboarding

## Approach

- Add a user-scoped criteria repository over the frozen `profiles` table; every read/update filters `user_id`, partial updates preserve omitted fields, and every write bumps `criteria_version` once.
- Expose `start_onboarding`, `get_criteria`, `update_criteria`, and `save_resume` with zod result contracts and the shared MCP result helpers.
- Replace the Profile placeholder with a bridge-only panel: empty users choose **Get started** or **See demo**; configured users edit title/skill chips, work mode, compensation, and Bridge mode directly or update through chat.
- Add a replayable first-run product tour with **Get started**, **See demo**, and **Quick tour** paths. The tour presents the continuous **Orient → Focus → Move → Evolve** journey and doubles as a concise hackathon presenter flow.
- Give returning users a compact journey card in Profile with one current recommendation and literal actions, while keeping the humor in supporting copy rather than user data.
- Simplify the first-run and returning-user copy so each screen explains the current state and one useful action. Remove requirement-shaped prose, repeated motivational lines, roadmap labels, and most quips; keep one restrained brand joke on the empty state.
- Package `skills/onboarding/SKILL.md`; server instructions added during F9 provide the same trigger guidance for direct custom-MCP installations.

## Files

- `src/features/criteria/{repo,tools,tools.test,index,panel,copy,tour,journey}.ts(x)`
- `skills/onboarding/SKILL.md`
- `docs/TOOLS.md`

## Tool shapes

- `start_onboarding {}` → `{configured, criteria, missing[], questionGroups[]}`; read-only, opens Profile.
- `get_criteria {includeResume?}` → normalized criteria plus `hasResume`; resume text is opt-in.
- `update_criteria {partial profile fields}` → updated normalized criteria; caller-scoped.
- `save_resume {text, extracted?}` → updated criteria and resume status; text ≤ 50 KB.
- `show_product_tour {}` → `{tab:"profile", mode:"tour", configured}`; read-only and opens Profile without changing criteria.

## Tests

- T1: user B cannot read or update user A's profile.
- Partial updates preserve omitted values and increment `criteria_version` once.
- Resume validation rejects text over 50 KB; extraction maps only supplied fields.
- Onboarding reports the intended missing fields and treats headline-only profiles as incomplete.
- Product tour returns the Profile route, tour mode, and configured state without changing the profile row or criteria version; registry contract includes the tool and its read-only annotations.
- Tour and journey UI are verified in MCP Inspector for empty, demo, configured, dark/light, narrow, and error/loading states per PLAN §29.2.
- The simplified UI is visually verified with empty, tour, configured, loading, and error states; the tour uses one explanation per step and the configured view presents one concrete next step instead of four equal framework cards.
- Full typecheck, lint, tests, build, production audit, local tool calls, and ChatGPT/Profile visual gate.

## Open questions and rulings

- `[local]` A configured profile requires at least one target title or skill; headline-only remains first-run.
- `[local]` Gather conversational answers in chat, summarize, and confirm before one `update_criteria` call; no persisted draft state.
- `[local]` `search_jobs` is conditional in the skill until P0-C registers it.
- `[local]` Tour state is ephemeral panel state seeded by tool output; it is not stored in D1. Closing or skipping returns to the normal Profile state.
- `[local]` The journey card uses current profile data only. It recommends **Focus** when core criteria are incomplete and **Move** when the profile is ready; Orient and Evolve remain available actions rather than invented progress metrics.
- `[local]` The Learning Journal is named as planned in Evolve, but its data tools and panel surface remain P1-I work.
- `[local]` Unbuilt features are removed from the normal Profile experience; Learning Journal returns when P1-I provides a working action.
- `[local]` Orient → Focus → Move → Evolve remains a compact tour structure, not persistent explanatory furniture on the configured screen.
- `[contract]` The global shell subtitle/footer/version language is outside P0-B ownership and includes copy the user explicitly wants removed. Request the integrator apply the shared-shell cleanup; continue with the independent Profile cleanup.
- No `[product]` question blocks implementation.
