# P0-A — Job sources

Approach:
- Verify official feed contracts and public board tokens; record failures without blocking other boards.
- Normalize five required ATS/feed sources plus criteria-driven Adzuna; share bounded HTML/plain-text normalization and skill extraction.
- Upsert global catalog rows by source/key, retain source health, and expose rotating board batches with at most ten subrequests.
- Bound interactive refresh to three fast requests and six seconds, reuse six-hour Adzuna query/location results, and provide a public fallback snapshot.

Files: `src/sources/adapters/*`, `src/features/jobs/{repo,service,catalog-tools}.ts`, `seed/{ats-boards,jobs-snapshot}.json`, `scripts/snapshot-feeds.ts`; this brief and contract requests in `docs/decisions-log.md`.

Tools: `refresh_jobs` input `{}` (verified ToolContext identity only); structured output `{ itemsUpserted, sources: [{ source, status, itemsUpserted }], progress: { stage: 'done', done, total }, fallback }`. Invalid inputs are rejected by central zod validation. Existing Jobs panel consumes source health; loading/error/progress integration belongs to P0-C.

Tests: T7 recorded-shape fixtures per adapter; HTML stripping/8 KB cap; limits/since; 404 board skips; one failing source still upserts others and records fetch_runs. T1 verifies profile criteria lookup cannot read another user's criteria. Repository dedupe and bounded refresh are covered in the source pipeline tests. All network calls mocked; final typecheck/lint/full tests required.

Open questions:
- [contract] Foundation jobs/index.ts is empty; integrator must wire catalog tools and cron APIs, and list refresh_jobs in docs/TOOLS.md.
- [local] Use fetch_runs success records as the rotation/freshness cursor; no new schema.
- [local] Snapshot entries are verified public job listings, with no applicant/contact data. Preserve legacy jobId/jobText keys for existing Decisions fixtures.
- [product] None; location targeting and board groups already decided by PLAN D3.
