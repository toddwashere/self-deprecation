# Continuous journey and first-run design

## Intent

Self-Deprecation should explain its vision by helping the person do real work. The first-run
experience introduces a continuing career-adaptation loop, then hands control to the same Profile,
Jobs, People, Prep, Today, and future Learning surfaces used every day. It is onboarding, product
story, and hackathon narrative at once—not a slide carousel embedded in an app.

The product thesis is:

> The industry shipped a breaking change. Your experience still compiles. Self-Deprecation makes
> the next useful move clearer and keeps learning as you do.

## Goals

- Give an empty account an immediate, understandable choice: **Get started**, **See demo**, or
  **Quick tour**.
- Teach a recurring four-part loop: **Orient → Focus → Move → Evolve**.
- Deliver useful actions from every stage rather than a percentage that eventually reaches 100%.
- Let a judge understand the problem, product, architecture, and continuing value through the live
  app without pausing for a conventional slide deck.
- Keep humor specific, restrained, and empathetic: roughly one quip per screen, followed by hope.
- Preserve a quiet, efficient experience for returning users.
- Record the Learning Journal as a first-class follow-up feature that can connect saved knowledge to
  future opportunities and development.

## Non-goals

- No mandatory tour, recurring boot animation, confetti, streak pressure, or fake migration-complete
  state.
- No architectural lecture in the ordinary user path.
- No broad navigation or schema change in this immediate task.
- No implementation of the Learning Journal in this task.
- No joke inside user-authored notes, compensation, scores, job facts, or difficult personal moments.

## Anti-goals

- Do not repeatedly describe the person as obsolete or deprecated. The industry and its interfaces
  are the unstable system; the person is the capable protagonist.
- Do not make the tour necessary to understand the controls.
- Do not let demo narration obscure real state or pretend unavailable features work.
- Do not turn continuing growth into an unfinished checklist that makes the user feel behind.

## Chosen approach

Use a **contextual journey**. One concise first-run surface introduces the thesis and three choices.
A short optional tour explains the four recurring areas using the actual product vocabulary. After
setup, Profile retains a compact journey card with the next useful action for each area. Future Today
and Learning work can surface the same model without changing its meaning.

Alternatives considered:

- **Tour-first carousel:** visually controlled but disposable, linear, and too easy to skip without
  learning the product.
- **Conversation-only narration:** natural but visually weak and less deterministic for a timed
  demonstration.
- **Contextual journey (chosen):** slightly more UI work, but it gives judges a clear story while
  leaving returning users with useful navigation instead of presentation residue.

## Experience model

The four areas are recurring lenses, not sequential completion states:

1. **Orient** — Understand the current profile, market changes, transferable strengths, and gaps.
2. **Focus** — Choose target roles, constraints, compensation, and the capabilities worth building.
3. **Move** — Review opportunities, strengthen relationships, prepare, apply, and follow up.
4. **Evolve** — Learn from results, capture knowledge, update the profile, and begin the next loop.

The UI may highlight one recommended area, but all four remain available. Copy says “next useful
move,” never “complete your migration.”

## Screen-by-screen first run

### Screen 1 — Breaking change

Shown for an account with no target titles and no skills.

- Eyebrow: `CAREER ADAPTATION LOOP`
- Heading: `The industry shipped a breaking change.`
- Body: `Your experience still compiles. Let’s make the next useful move clearer.`
- Compact loop preview: `Orient → Focus → Move → Evolve`
- Primary action: **Get started**
- Secondary actions: **See demo**, **Quick tour**
- Plain warning under See demo: it replaces existing Self-Deprecation workspace data with public-safe
  sample data.

There is no timer, automatic tool call, or forced tour.

### Screens 2–5 — Quick tour

Quick tour stays inside the Profile panel and can be closed at any time. It uses four compact cards,
one at a time, with **Back**, **Next**, **Skip tour**, and a final literal action. Each screen contains
one restrained line of personality and ends with utility or hope.

#### Orient

- Heading: `Know what still works—and what changed.`
- Explain Profile, AI-Native Ladder, and market signals.
- Example evidence: strengths, current targets, gaps, and recent signals.
- Line: `The runtime changed. Your production experience did not disappear.`

#### Focus

- Heading: `Turn ambiguity into criteria.`
- Explain target titles, work mode, compensation, skills, avoid lists, and Bridge mode.
- Show that confirmed criteria drive ranking and can evolve later.
- Line: `A search without constraints is just doomscrolling with filters.`

#### Move

- Heading: `Create momentum in more than one lane.`
- Explain Jobs, People, and Prep as one coordinated workflow.
- Show the sequence: ranked opportunity → relevant person → focused preparation → follow-up.
- Line: `Applications are one API. Humans remain another.`

#### Evolve

- Heading: `Keep the system learning.`
- Explain weekly review, profile changes, the career changelog, and the planned Learning Journal.
- Show that notes and outcomes can improve later recommendations.
- Line: `The plan is expected to change. That is maintenance, not failure.`

The final tour screen offers **Set up my search** and **Explore demo**. It does not write data merely
because the tour was viewed.

### Conversational setup

**Get started** sends the existing onboarding prompt. ChatGPT calls `start_onboarding`, asks one or
two questions at a time, summarizes all answers, and waits for explicit confirmation before calling
`update_criteria`. It offers resume capture as optional. Difficult personal context suppresses humor.

After saving, the Profile panel displays the editable criteria form and journey card. It offers one
clear next action; `search_jobs` is offered only when that tool actually exists.

### Demo path

**See demo** calls the existing destructive `load_demo_data` tool, then reloads Profile. The panel
shows populated criteria and the journey card. Presenter narration may point out the four areas, but
the data and controls are the same as the ordinary product.

## Returning Profile experience

Above the editable criteria form, show a compact adaptation-loop card:

- Four labeled areas with a one-line current-state summary.
- One area may be marked **Recommended next** based on deterministic available state.
- Each enabled action is literal: **Review profile**, **Review jobs**, **Open people**, **Practice**,
  or **Run weekly review**.
- Actions route through the shared bridge and existing tools; no direct network calls.
- Unavailable future capabilities are labeled **Planned**, never simulated.

The first implementation derives only what is currently reliable:

- **Orient:** profile saved or setup needed.
- **Focus:** target titles/skills present or missing.
- **Move:** open Jobs when available; otherwise explain that matching is the next product milestone.
- **Evolve:** offer a short review prompt that summarizes what changed and asks whether criteria
  should change. Learning Journal is labeled planned until implemented.

## Presenter behavior

The ordinary Quick tour doubles as Presenter mode for the hackathon. A `show_product_tour` tool can
open Profile with `{ tab: "profile", mode: "tour" }`, making the flow deterministic from a prompt
such as “Show me what Self-Deprecation does.” It is read-only and never marks setup complete.

The tour reveals technical detail only after value:

- ChatGPT handles conversation, synthesis, and research.
- MCP tools perform explicit, typed actions.
- The Worker stores isolated state.
- Decisions ranks opportunities when available.
- The panel keeps progress visible.

This reveal should be concise enough to fit the final 20–30 seconds of the three-minute demo.

## Voice rules

- One humorous line per tour screen at most.
- Joke about the situation or software metaphor, never the person.
- End on a useful action or hopeful statement.
- Buttons and labels remain literal.
- Suppress humor after layoffs, rejection, financial stress, discrimination, illness, burnout, or
  family pressure.
- Avoid cute mascots, confetti, meme language, and repeated “you are deprecated” claims.

## State and accessibility

- No new persistent state is required for the first version. Empty criteria select first run;
  configured criteria select the returning form.
- Tour position is local panel state. Closing it returns to the appropriate empty or configured
  Profile state.
- Viewing the tour never alters criteria or demo data.
- Keyboard focus moves to the new tour heading; actions have accessible names; reduced-motion users
  receive no animated transitions.
- Loading, empty, configured, error, and bridge-unavailable states remain explicit.

## Immediate implementation boundary

Keep the first implementation within P0-B-owned paths:

- `src/features/criteria/panel.tsx`
- `src/features/criteria/copy.ts`
- `src/features/criteria/tools.ts`
- `src/features/criteria/tools.test.ts`
- `skills/onboarding/SKILL.md`
- generated panel output under the logged build-only exception

Add `show_product_tour` to the criteria tool array rather than changing the frozen registry or tab
list. The Profile panel reads initial tool output to enter tour mode. No database migration is needed.

## Implementation sequence

1. **P0-B continuation:** first-run opening, Quick tour, `show_product_tour`, configured journey
   card, and updated onboarding copy.
2. **P0-F packaging/demo:** starter prompt, exact three-minute tour-to-demo script, presenter evals,
   and deterministic reset/demo rehearsal.
3. **P1-D Today:** recurring weekly review, next-best-action summary, and career changelog display.
4. **P1-H Level:** Orient/Evolve evidence from ladder assessments and completed quests.
5. **P1-I Learning Journal:** structured capture, search, resurfacing, and connections to events,
   news, jobs, prep, and briefs.

The shared four-area language is fixed by this design; each owner adds evidence and actions inside
its feature rather than rebuilding the tour.

## Learning Journal feature note

Create a later task, provisionally **P1-I · Learning Journal**, with ownership of
`src/features/learning/*` and `skills/learning-journal/`. Its product promise is quick capture plus
useful resurfacing, not merely note storage.

Proposed entry shape:

- title, body in Markdown, entry kind (`talk`, `article`, `course`, `idea`, `reference`)
- source URL and source title
- speaker or author, event, and occurred-at date
- tags, key takeaways, follow-up questions, and next actions
- pinned/archive state and timestamps

Proposed actions:

- `save_learning_entry`
- `list_learning_entries`
- `get_learning_entry`
- `update_learning_entry`
- `search_learning_entries`

The skill should understand prompts such as “Remember this talk,” “Save this link,” and “What have I
saved about agent evaluation?” Later integrations may connect entries to saved events, AI news,
AI-Native Ladder quests, job requirements, interview prep, and daily briefs.

Do not overload CRM notes for the finished feature. Generic notes lack structured URLs, authors,
tags, takeaways, and resurfacing state. The recommended contract decision is to reserve a
`learning_entries` table before the `foundation-v1` tag, while leaving tools and UI to P1-I. That
preserves the no-parallel-migrations rule without pulling the journal into the immediate demo path.

## Verification

- Tool test: `show_product_tour` is read-only, opens Profile, and writes no criteria.
- Existing isolation and criteria tests remain green.
- Visual checks: all five first-run/tour screens, Back/Next/Skip, empty return, configured return,
  light/dark themes, and narrow panel width.
- MCP Inspector: tour tool schema has required annotations/status and the app resource renders.
- ChatGPT: “Show me what this does” opens the tour; Get started enters conversational onboarding;
  See demo loads the configured Profile.
- Full lint, typecheck, tests, build, audit, deploy, refreshed-plugin/new-chat check.

## Rollout and demo use

- Returning configured users see no forced interruption.
- New users see the three choices immediately.
- The hackathon script invokes `show_product_tour`, advances through the four areas quickly, then
  uses **Explore demo** to transition from narrative into the live workflow.
- The closing line is: `The plan is never finished. The next useful move is clearer.`
