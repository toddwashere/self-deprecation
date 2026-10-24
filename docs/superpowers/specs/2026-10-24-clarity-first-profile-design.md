# Clarity-First Profile Design

## Intent

Make the Profile experience useful to a person managing a job search, not a display of the product brief. Every screen should explain the current state, the next action, or the consequence of that action.

## Goals

- Keep one restrained brand joke on the empty state, followed immediately by practical guidance.
- Reduce each tour step to a label, a direct heading, and one explanatory sentence.
- Replace the returning four-card framework with one recommendation based on real profile state.
- Use literal status and confirmation messages.
- Remove unbuilt roadmap features and implementation architecture from the normal experience.

## Non-goals

- No server, persistence, tool-shape, or routing changes.
- No Learning Journal UI until P1-I supplies a working feature.
- No shared Foundation shell edits from P0-B; those are logged for the integrator.

## Chosen approach

Keep the existing Profile and tour components but reduce their information density. Preserve Orient → Focus → Move → Evolve only as tour navigation. The configured view renders one state-derived next-step card: finish search preferences when titles or skills are absent, otherwise review matching jobs.

Alternatives rejected: retaining four cards with shorter prose still presents the internal framework as a checklist; removing the tour entirely loses the concise first-run explanation and hackathon presenter path.

## Verification

Project policy assigns panel copy and layout to visual QA rather than unit tests. Build the embedded panel and inspect empty, all four tour steps, configured-incomplete, configured-ready, loading, error, narrow, light, and dark states. Run the full repository gate before deploy.
