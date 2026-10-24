# Kickoff prompts

Copy-paste prompts for starting agents. Works in Codex, Claude Code, or similar.

## Step 1: Foundation (one agent, sequential; don't parallelize this)

> You are building the Foundation for Self-Deprecation. Read `AGENTS.md`, then `docs/PLAN.md`
> (§3–§9, §15, §17 Foundation, §24, §27, §29, §31). Execute tasks F1 → F8 in order, writing
> `docs/tasks/F.md` first. Start with the F1 spike and **stop after F1** to report: deployed URL,
> whether the hello panel renders in ChatGPT (Todd will check), and the transport/SDK decisions
> (log them in `docs/decisions-log.md`). After Todd confirms, continue F2–F8. Commit after each
> step, push at each milestone. Mark anything you couldn't verify. When F8 is done, run the F9
> checklist with Todd and tag `foundation-v1`.

## Step 2: P0 fan-out (orchestrator, after `foundation-v1`)

> You are the orchestrator for Self-Deprecation. Read `AGENTS.md` and `docs/PLAN.md` (§17–§18,
> §26). Spawn one sub-agent per task: P0-A, P0-B, P0-C, P0-D, P0-E, P0-F, each in its own git
> worktree on branch `task/<ID>-<slug>`, each given this instruction: "Read AGENTS.md and
> docs/PLAN.md. You own task <ID>. Work only in its Owns paths. Write docs/tasks/<ID>.md first."
> Your job: unblock them, route `[contract]` requests (you apply contract changes on main, then
> tell owners to rebase), batch `[product]` questions to Todd with recommended defaults, merge
> finished branches in the order P0-A → P0-B → P0-C → P0-D → P0-E → P0-F, keep `main` green and
> deployed, and report status every ~45 minutes in `docs/STATUS.md`. Don't write feature code
> yourself.

## Step 3: P1 fan-out (after P0 dry run #1)

> Same as Step 2 with tasks in priority order: P1-D, P1-H, P1-C, P1-B, P1-A, P1-E (P1-F and P1-G
> only if lanes are free). Each P1 tab stays `enabled: false` until its Done-when passes. Feature
> freeze at 13:30.
