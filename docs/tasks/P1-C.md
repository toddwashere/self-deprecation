# P1-C — AI news

- Ingest verified public publisher RSS/Atom feeds on the existing news cron, with a bounded timeout, safe HTTP links, short plain-text snippets, canonical URL dedupe, topic extraction, and independent source failures.
- Keep request-time reads in the global news repository. Expose catalog freshness and source health honestly; no user tables or new secrets.
- Register `get_ai_news` through the feature module. Build the News panel through Bridge only and a weekly skill that summarizes returned evidence in at most 250 words with links.

Files: `src/features/news/{index,repo,tools,copy,panel,adapters}.ts[x]`, adjacent fixture/contract tests and fixtures, `skills/weekly-ai-news/SKILL.md`; feed entry files `src/sources/adapters/news_*.ts` are explicitly owned in PLAN §18 if needed. Contract requests go to `docs/decisions-log.md`.

Tool: `get_ai_news({since?: epochMs, limit?: int 1..50, topics?: string[<=10]})` → `{tab:'news', items:[{id,source,title,url,snippet,author,publishedAt,fetchedAt,tags,score,ageHours}], updatedAt, stale, sources:[{id,status,lastSuccessAt,finishedAt}], progress:{stage,done,total}}`. Unknown user IDs rejected. Annotations read-only, non-destructive, closed-world (stored results only); OAuth metadata supplied centrally.

Panel: loading, empty with refresh, retryable error, source outages, stale data, progress, topic filter, linked articles with source and age; no direct network calls.

Tests: strict red/green T7 fixture normalization for each implemented adapter; dedupe/upsert; one source throws while peers persist and fetch_runs records errors; T4 input/output/metadata contracts, bounded filtered reads and unknown-date handling. No T1 needed: only public global tables accessed. UI verified manually via rendered seed/empty/error/progress output per §29.

Questions: [local] Use OpenAI, Hugging Face, DeepMind and Simon Willison public feeds after live verification; no keys. [contract] Frozen News tab must be enabled by integrator and frozen tool registry snapshot amended for `get_ai_news`. Cron uses existing dispatcher with owned feed entry files; no shared routing change.

Validation: 2026-10-24 local daily cron inserted 80 real public headlines (20 each, OpenAI/Hugging Face/DeepMind/Simon), all four successful. MCP SDK transport with DEV_AUTH_BYPASS=1 returned 30 dated weekly stories and rejected limit:0; OAuth metadata verified. Six panel states rendered/inspected, including demo's empty-news shape; summary-only open_dashboard initial output also checked. Full typecheck/lint pass; full suite's only failure is frozen registry snapshot missing get_ai_news (integrator request). Production deploy/ChatGPT validation awaits integration; no new configuration or secrets.
