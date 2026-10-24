# P1-A — Bridge mode and contract leads

## Approach

- Replace the two predeclared HN placeholder adapters with bounded Algolia adapters: discover the newest matching `whoishiring` story, load its item tree, parse direct comments, and normalize first-line job metadata.
- Ingest the latest **Freelancer? Seeking freelancer?** thread plus contract/freelance posts in the current **Who is hiring?** thread through the existing `30 6 * * *` cron and global jobs catalog.
- Keep Bridge mode and list reads in a feature-owned repo. `userId` comes only from `ToolContext`; global leads are joined only to the caller's match state.
- Return a Jobs-compatible structured result with the `contract` filter so the existing Jobs panel can render and continue ranking after central integration.
- Treat source failure as source status, not a blank product; both adapters retain 5-second timeouts and 2 MB response caps.

## Files

- Create/edit: `src/features/contracts/{index,copy,repo,repo.test,tools,tools.test}.ts`
- Replace: `src/sources/adapters/{hn_hiring,hn_freelance}.ts`
- Create: `src/sources/adapters/hn_common.ts`, `src/sources/adapters/fixtures/hn_{hiring,freelance}.json`, adapter tests
- Required process files: this brief; append-only `docs/decisions-log.md`

## Tool shapes and UI states

- `set_bridge_mode({ enabled: boolean })` → `{ tab:'jobs', bridgeMode, criteriaVersion }`.
- `list_contract_leads({ query?, remoteOnly?, limit? })` → `{ tab:'jobs', bridgeMode:true, filters:{employmentType:'contract',…}, jobs:[…], criteriaVersion, fallback:false, progress:{stage:'done',done,total}, taskId, sources:[…] }`.
- Loading/error/empty/result rendering uses the existing Jobs panel after the integrator adds the Bridge chip/filter. Without Bridge mode, list returns `BRIDGE_MODE_OFF` with the literal next action.

## Tests

- T7 recorded fixtures: latest-thread selection, direct-comment first-line parsing, nested-reply exclusion, contract classification, HTML stripping/truncation, and per-adapter source isolation through the existing dispatcher contract.
- T1 repo: user B cannot read user A's match state or change A's Bridge mode; global contract rows remain shared.
- Tool contract: invalid input, Bridge-off failure, set/read success, output-schema validation, required annotations/status.
- Local smoke: both live adapters return at least 10 combined contract leads; Inspector valid/invalid calls after integration.

## Open questions

- `[contract]` The frozen registry already points at both HN adapters and the cron already selects them; the integrator must update the tool snapshot/`docs/TOOLS.md` and add the Bridge chip/filter to Jobs UI.
- `[contract]` Official HN Algolia docs still provide `/search_by_date`, `/items/:id`, anonymous access, and 10,000 requests/hour/IP. Dedicated Freelancer threads are now community-run; query recent comments and accept only posts beginning `SEEKING FREELANCER`, preserving each comment's visible age.
- `[local]` Read-only listing never triggers a network refresh. Cron owns ingestion, keeping the tool fast and honest about source freshness.
