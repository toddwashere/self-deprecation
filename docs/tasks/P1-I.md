# P1-I — Learning Journal

## Approach
- Store learning separately from CRM notes in reserved `learning_entries`; all repository queries filter ToolContext user identity.
- Export `learningFeature` and `LearningPanel` for integration, preserving frozen files. Read stored facts only; no external calls or AI costs.
- Provide bounded capture/browse/search/detail/update tools with zod contracts, actionable errors, and literal search before pagination.
- Build a Bridge-only panel with browse/search/detail/create/edit and loading/empty/error/saving states; retain user text.
- Add a capture/retrieval skill that uses supplied links, marks unknowns, and preserves user wording.

## Files and contracts
Owned `src/features/learning/{index,repo,tools,copy,panel}.ts[x]`, colocated T1/T4 tests, `skills/learning-journal/SKILL.md`, this brief.
- `save_learning_entry`: `{title, kind?, body?, sourceTitle?, sourceUrl?, author?, occurredAt?, tags?, takeaways?, followUpQuestions?, nextActions?, pinned?, archived?}` → `{tab:'learning', entry}`.
- `get_learning_entry`: `{entryId}` → `{tab:'learning', entry}`.
- `update_learning_entry`: `{entryId, ...partial capture fields}` → `{tab:'learning', entry}`.
- `list_learning_entries`: `{kind?, tag?, archived?, limit?, offset?}` → `{tab:'learning', entries, filters, hasMore, asOf, progress}`.
- `search_learning_entries`: `{query, ...list filters}` → same list shape. Default active entries, pinned then newest, page 50/max100. Unknown source/date stay null.

## Tests / verification
Observe failing T1 isolation (get/search/update-by-ID included) and T4 validation/output/metadata tests before implementation. Run typecheck, lint, full suite, build. Manually render states with Bridge fixtures; exercise MCP valid/invalid after registration. Skill manual scenarios: talk notes, absent URL, retrieval, unchanged quotation.

## Verification evidence
Typecheck/lint pass; full suite 187 tests / 27 files pass; Worker dry-run and isolated journal bundle build pass. CUA checked browse/search/detail/create/update, loading/empty/error/saving, retained failed-save draft, source Bridge, both themes, and changed-fields-only updates. Inspector latest exercised all five tools plus invalid save/update through a temporary local DEV_AUTH_BYPASS wrapper (no frozen-file edits). Skill reviewed against talk/no-link/retrieval/quotation scenarios; no separate model eval. Shared registry/navigation, docs/TOOLS, optional seed journal fixtures, deploy, and ChatGPT checks remain integrator work.

## Decisions / open questions
- [local] Existing Drizzle/shared UI; bounded literal search; defer eventId until a cross-feature ownership contract is available.
- [contract] Integrator imports `learningFeature` into registry and `LearningPanel` into approved Learn/Journal navigation; lists tools in docs/TOOLS.md; deploys and verifies ChatGPT. Request in decisions-log.
- [product] None; approved Journal/News/Events/Growth grouping is shared integration work.
