# P0-E · Interview prep and company intel

- Read saved/applied/interviewing/offer jobs through user-scoped joins in prep's repository; return a compact profile, related job/company notes, saved prep, and reusable company/role intel. No dependency on unmerged Jobs code.
- Store prep as job notes and validated interview reports as company notes (`kind=interview_intel`, JSON body). Scope every read/update by caller, subject, and kind; reject inaccessible jobs and foreign note IDs.
- Register four bounded local tools; generation and public research stay in ChatGPT skills. Render the Prep tab with saved-job status, cited loop cards, saved prep, and bridge-only prompt actions.
- Implement tests first for T1 isolation and T4 input/output contracts; manually verify panel loading, empty, error, populated, and handoff-progress states. Run full typecheck, lint, tests and local valid/invalid MCP calls.

Files: `src/features/prep/{index,repo,tools,tools.test,copy}.ts`, `src/features/prep/panel.tsx`, `skills/{interview-intel,interview-prep,mock-interview}/SKILL.md`, this brief.

Tool shapes (zod schemas exported from `tools.ts`):
- `get_prep_context({jobId?})` → `{tab:'prep', savedJobs:[{id,company,title,status,prepStatus}], job?, profile, relatedNotes, prep, intel, progress}`. Without a job, returns overview plus saved company intel.
- `save_prep({jobId,noteId?,title,body})` → `{tab:'prep', prep:{id,jobId,title,body,updatedAt}}`.
- `save_interview_intel({jobId?,report:{company,role?,stages,coding,systemDesign,behavioral,tips,redFlags,confidence,sources,lastResearchedAt}})` → `{tab:'prep',intel:[{id,report,updatedAt}]}`.
- `get_interview_intel({company?,jobId?,role?})` → `{tab:'prep',intel:[…]}` (no selector lists caller's reports).

Tests: cross-user overview/context/intel/notes reads, foreign job and note update attempts, owner update round trips; cited report validation, unsafe URLs and oversized input rejection; successful outputs validate declared schemas; tool metadata contracts.

Open questions: [local] Selected jobs require an existing caller-owned job match; overview includes saved/applied/interviewing/offer. Use company intel across jobs, preserving role variants and date/confidence. [local] Browser-visible handoff progress ends on a tool-result event; synchronous storage tools return done immediately. [contract] Integrator must update frozen registry snapshot and docs/TOOLS.md after merge; deploy/ChatGPT/voice checks require integrated release. No frozen file edits in this branch.

Verification: T1/T4 prep tests pass (3); typecheck, full lint, production build pass. Full suite: 29 pass, one expected failure in the frozen registry's old tool-name snapshot. MCP Inspector lists all four tools (0 schema portability errors), accepts valid calls and rejects invalid calls for each. Real panel visually checked with the demo profile plus fictional job/intel fixtures: light/dark, populated, empty, loading, error/retry, source disclosure, practice-link bridge, ChatGPT handoff. Three skill frontmatters validate. Known gaps: integrator's snapshot/catalog update, integrated deploy, fresh ChatGPT flow and voice rehearsal; demo seed currently has no saved jobs.
