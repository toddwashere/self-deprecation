# Decisions log (append-only)

Record architecture decisions, VERIFY answers, and contract-change requests here.
Format: `## YYYY-MM-DD HH:MM — <title>` · who · what · why · affected tasks.

## 2026-10-23 23:15 — Initial decisions (planning)
- Track 2 (Build Inside ChatGPT). Stack: Cloudflare Workers + D1 + Drizzle, TypeScript.
- Auth: GitHub OAuth via workers-oauth-provider; users 1→many auth_identities for future providers.
- AI split: ChatGPT does generation on the user's plan; our only routine API cost is Decisions scoring.
- Full schema (incl. P1 tables) created in Foundation to avoid parallel migration conflicts.
- Voice: "laugh, then wince, then hope" (PLAN §24).

## 2026-10-23 23:30 — Plan v1.1
- Decisions scoring: small batches (default 20 jobs/request, ≤ 3 concurrent) using compact job digests, per-batch fallback.
- Added AI-Native Ladder feature (PLAN §25, task P1-H) + `ladder_assessments`/`ladder_quests` tables in the F3 schema.
- Agents commit often (AGENTS.md "Commit often").

## 2026-10-23 23:45 — Plan v1.2 (Todd's answers)
- D1: stay on Cloudflare Workers (not a Node server); agent may switch to Node fallback if the F1 spike fails.
- D2: open signup; protect cost with per-user Decisions caps + kill switch.
- D3: location is user-driven; add Adzuna location search; seed boards with Utah employers, remote-first, AI labs.
- D4: thresholds are user settings; unlisted salary kept and labeled (toggle to hide).
- D5/D6: public-safe demo data; visual direction pre-approved.
- D7: ladder "inspired by" Boris Cherny; more self-assessment lenses (§25.7).
- New: §27 progress/status UX (toolInvocation status lines, progress + stepper, get_task_status).
- New: §28 company interview intel (P0-E) via ChatGPT web search; no scraping.
- Bridge: MCP Apps standard first, window.openai for ChatGPT-only features (per OpenAI plugin reference).
