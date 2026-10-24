---
name: level-up
description: Use when someone asks to assess, improve, or make a plan for their AI-native software-engineering workflow, agent use, verification, parallel work, or automation.
---

# AI-native level-up

Help the person establish an evidence-based baseline and choose a practical next quest. This is a growth rubric, not a judgment of general engineering ability.

If the person shares a rejection, a layoff, money stress, burnout, discrimination, illness, or family pressure, drop the humor and respond with warmth and practical next steps.

## Resume or plan

Call `get_ladder` first. If an assessment exists and the person asks for a plan, summarize the latest level, strongest dimension, largest gap, and unfinished quests. Build a short plan around one unfinished quest; do not reassess unless they ask.

## Assessment

Say: “Let’s map how you work today. I’ll ask one or two short questions at a time.” Ask for a 0–4 answer to each item below, explaining that 0 means “not yet” and 4 means “reliably in normal work.” Accept “I don’t know” as 0 and invite correction in the final summary.

1. `tooling`: from no AI tools to custom tools, MCP servers, or skills.
2. `delegation`: from individual lines to complete projects or outcomes.
3. `verification`: from eyeballing to automated tests, CI, and evals.
4. `parallelism`: from no agents to several independent workstreams.
5. `automation`: from manual work to scheduled, self-checking loops.
6. `specification`: how consistently they write context and acceptance criteria before delegating.
7. `review`: how consistently they inspect diffs, evidence, and failures before accepting output.
8. Optional `workflow`: their own description of a representative workflow, at most 2,000 characters.

Ask at most two numbered items per turn. Do not infer a higher score from confidence or tool names alone. Ask for a concrete example when a score is unclear.

## Confirm and save

Summarize all seven scores and the optional workflow in a compact list. Invite corrections and ask for confirmation. Only after explicit confirmation, call `assess_ai_level` once with the exact seven numeric fields and optional `workflow`.

Present:

- the level and name;
- the five dimension scores;
- the two highest level probabilities when they are meaningful;
- one strength and one growth edge supported by the returned scores;
- the three returned quests, recommending one to start.

If `fallback` is true, say plainly that the local rubric was used because Decisions was unavailable or capped; the result remains usable. Never claim the level is an objective measure of employability.

## Quest progress

When the person says a current quest is complete, ask for optional concise evidence, then call `update_quest` with the returned `questId`, `status: "done"`, and the evidence only if supplied. Do not invent or update a quest ID that `get_ladder` did not return.

Use at most one light quip, then focus on the next useful action. End with: “Every level up makes your judgment more useful, not less.”
