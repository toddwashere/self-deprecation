# P0-C · Scoring + Jobs tab

- Select the user's top 60 eligible catalog jobs with pure, evidence-based filters; honor listed pay floors, remote/location, employment, avoid lists, and 45-day freshness. Unknown salaries stay visible unless hidden explicitly.
- Store user-scoped matches in `scoring/repo.ts`; reuse `lib/decisions.ts` for batch scores and deterministic reasons. Reuse scores only for the current criteria version; preserve saved/application status on rescoring.
- Score at most one batch (20 maximum) per invocation using the shared six-second timeout; return ranked results and progress, then resume through score_jobs without background promises.
- Build Jobs cards, filters, save/dismiss, Prep-me handoff, progress, fallback notice and source-health footer through Bridge only.

Files: `src/features/scoring/{repo,service,filters,index}.ts`, owned tests; `src/features/jobs/{tools.ts,panel.tsx,copy.ts}`; this brief. No catalog ingestion or shared-module changes.

Tools (all inputs omit user ID): `search_jobs({query?,status?,employmentType?,remoteOnly?,hideUnlistedSalary?,limit?})` → `{tab:'jobs',filters,jobs:JobCard[],criteriaVersion,fallback,progress,taskId?,sources}`; `get_job({jobId})` → `{tab:'jobs',job:JobCard}`; `update_job_status({jobId,status})` → same detail; `score_jobs({limit?})` → same search result. `JobCard` includes public job data, current fit score/source/reasons, user status, and scored time. All output shapes use zod in tools.ts. Loading skeleton, empty onboarding CTA, retryable error, and in-progress state render in panel.

Tests: T6 table-driven pure filters (pay/unknown pay/location/remote/avoid/employment/age); T1 cross-user match read/update isolation and cache/status preservation; T4 owned tool valid/invalid inputs and result schemas; T5 wrapper remains existing coverage. Panel verified by seed render, per §29 no component tests.

Open questions: [contract] jobs/index.ts is an unwired Foundation stub; integrator must register owned jobsTools. [local] Integrator approved catalog reads in scoring/repo.ts behind narrow exported adapters; no waitUntil dependency. [local] USD floor applies only to USD or unspecified currency; other currencies are labeled, never falsely compared. [local] null postedAt stays eligible, explicitly unknown. No new product decisions.
