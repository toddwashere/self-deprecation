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

## 2026-10-23 23:56 — F1 platform spike decisions and VERIFY results

- **Transport: stateless Streamable HTTP.** Use Cloudflare Agents `createMcpHandler()` with MCP SDK v2 and no transport Durable Object. Cloudflare's current guide says `McpAgent` is deprecated and feature-frozen for new servers; the current GitHub OAuth template source also uses `createMcpHandler`. Sources: [Cloudflare remote MCP guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/), [transport reference](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/).
- **OpenAI extensions SDK works on Workers.** `@openai/mcp-extensions@0.2.1` imports, initializes `OpenAIExtensions` against `@modelcontextprotocol/server@2.3.1`, typechecks, bundles under Wrangler, runs under local workerd tests, and is deployed. MCP Inspector lists both `thread` and `global` entrypoints and reads `ui://self-deprecation/hello` as `text/html;profile=mcp-app`. The package's pinned transitive `zod@4.4.3` has a high-severity advisory, so npm overrides it to the tested `zod@4.6.7`; production audit reports zero vulnerabilities. Sources: [OpenAI extensions SDK](https://github.com/openai/mcp-extensions/tree/main/typescript), [OpenAI plugin extensions reference](https://developers.openai.com/plugins/build/extensions).
- **Cloudflare GitHub OAuth template: useful reference, not §9-complete.** The current source provides GitHub login/consent with CSRF protection, KV-backed grants, `/authorize`, `/token`, `/register`, stateless `/mcp`, and S256-only PKCE (`allowPlainPKCE: false`). It does not configure §9's explicit protected-resource metadata, resource/audience enforcement, required/supported scopes, or CIMD; its basic tools do not declare per-tool OAuth security schemes. The repository is internally stale: `package.json` still pins workers-oauth-provider `0.8.1`, `wrangler.jsonc` still declares an unused Durable Object, and the README still instructs clients to use `/sse`. F2 should retain the GitHub consent/CSRF patterns but upgrade to the current 1.x provider configuration and verify every §9 endpoint/challenge. Sources: [template source](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-github-oauth), [current workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider).
- **R1 Node fallback: not triggered.** Workers has passed typecheck, local workerd execution, production bundle/startup, strict Inspector schema validation, live `ping`, and live MCP App resource discovery. Trigger R1 only if the real ChatGPT render check fails because the MCP UI/extension runtime is incompatible with Workers and cannot be isolated to metadata, packaging, or a supported SDK version. OAuth discovery failures belong to R2/F2, not R1. The zod override is portable and does not justify a Node move.
- **F1 ChatGPT gate passed (2026-10-24).** The deployed no-auth development plugin invoked `ping`, returned the model-readable success result, and rendered `ui://self-deprecation/hello` in the conversation panel. The installed plugin also exposed the expected tool to a fresh Codex task. R1 remains untriggered; proceed to F2 OAuth.
- **Testing package VERIFY:** Cloudflare renamed `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` in August 2026 with the configuration API unchanged. Foundation uses the supported `@cloudflare/vitest-plugin@1.4.7`. Source: [Cloudflare migration notice](https://developers.cloudflare.com/changelog/post/2026-08-19-vitest-plugin/).

## 2026-10-24 00:44 — F2 production OAuth contract verified

- `@cloudflare/workers-oauth-provider@1.2.4` is the deployed authorization server and resource-server boundary. GitHub is only the upstream identity provider; its access token is not exposed to MCP clients.
- Production `/mcp` rejects an unauthenticated initialize request with `401`, `WWW-Authenticate: Bearer`, the exact `mcp:read` scope, and a path-suffixed protected-resource metadata URL. That metadata binds the exact resource `https://self-deprecation.metodd.workers.dev/mcp` to this authorization server.
- Authorization-server discovery advertises DCR, CIMD, authorization code plus refresh-token grants, public clients (`token_endpoint_auth_methods_supported` includes `none`), S256-only PKCE, and authorization-response issuer protection. The resource and issuer are exact HTTPS URLs; no origin-only audience shortcut is used.
- `DEV_AUTH_BYPASS` is accepted only when `ENVIRONMENT=development`; production refuses it. `ToolContext.userId` is derived only from verified provider grant props. GitHub identity find-or-create persists the internal user and `auth_identities` mapping before completing authorization.
- The six authorized production credentials (GitHub client ID/secret, cookie key, OpenAI key, and Adzuna ID/key) are stored as Cloudflare `secret_text` bindings. Development-only flags were not uploaded. OAuth consent remains the shared F9 ChatGPT gate so F3–F8 can proceed without interrupting Todd.

## 2026-10-24 00:46 — F3 schema contract established

- The complete §7 schema is represented in `src/db/schema.ts` and migration `0002_foundation.sql`; both local and production D1 applied the migration successfully. JSON columns use typed Drizzle JSON mode and user-owned rows have cascading internal-user foreign keys.
- Future feature repositories must run the shared T1 isolation assertion, which verifies cross-user list, update-by-ID, and delete-by-ID behavior. The helper itself passed against real Miniflare D1.
- `db:reset:local` is intentionally local-only: it drops the known Foundation tables and reapplies recorded migrations. It never accepts a remote flag.

## 2026-10-24 00:50 — F4 feature registry and tool contract

- Feature modules own declarative `ToolDef` arrays; `src/mcp/server.ts` is the only registration path and centrally adds `mcp:read`, invocation status, annotations, and the shared panel URI. The small `as never` adapter is confined to this registrar because the SDK's static generic overload cannot preserve heterogeneous runtime zod schemas.
- All 13 planned feature modules are predeclared, so later feature work changes only its own folder. The T4 contract and MCP integration tests cover unique snake-case names, descriptions, three required annotations, status length, OAuth metadata, tool-list snapshot, and typed current results.
- The canonical resource URI is now `ui://self-deprecation/panel`; F5 will replace its placeholder HTML with the embedded React shell.

## 2026-10-24 00:54 — F5 embedded panel and bridge

- Vite produces one self-contained HTML resource and `scripts/embed-panel.mjs` converts that exact artifact into the Worker module. The measured panel is 233,852 bytes raw / 74.37 KB gzip, below the 400 KB target, with no external script or network dependency.
- `web/src/bridge.ts` is the only host boundary. It implements the MCP Apps 2026-01-26 view handshake and JSON-RPC methods directly, then falls back to `window.openai` for ChatGPT-specific widget state and legacy host calls. Using the full view SDK was tested but rejected locally because it expanded the panel to 686.95 KB; the server-side MCP Apps packages remain unchanged.
- The visual browser check passed for the shell, ten-tab navigation, disabled P1 states, Today empty state, Settings loading/error states, responsive labels, and hope-line footer. F6 activates the already-wired Reset and Load Demo buttons.

## 2026-10-24 00:58 — F6 core data lifecycle

- `reset_my_data` requires the exact `RESET` confirmation and deletes only the caller's user-scoped rows. It preserves internal users, auth identities, other users, and global catalogs; the profile becomes an empty row with an incremented criteria version.
- `load_demo_data` always resets first, then inserts deterministic public-safe profile, contacts, note, and event IDs. Repeated tool calls and `npm run seed:local` converge to the same row counts.
- Local auth bypass now idempotently creates its internal development user before user-scoped writes. Production still derives the ID exclusively from verified OAuth props. The central registrar catches unexpected tool errors, emits only an error type plus tool name to logs, and returns a sanitized `INTERNAL` result.

## 2026-10-24 01:01 — F7 Decisions API contract and smoke

- Official OpenAI documentation confirms Decisions is GA, `gpt-6-luna` is the only supported model, JavaScript SDK 7.30+ exposes `client.decisions.create`, requests accept 1–400 named predicate/choice/score questions, question instructions accept content-part arrays, and score answers return a zero-based probability-weighted score plus probabilities/confidence. Foundation pins `openai@7.43.0`. Sources: [Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [TypeScript create reference](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create).
- T5 covers configurable batching, bounded concurrency plumbing, answer-name mapping, 0–4 to 0–100 scaling, per-batch HTTP/timeout failure fallback, per-question refusal fallback, deterministic heuristic ordering, and caller-isolated daily caps recorded in `api_usage`.
- The authorized live smoke sent five public-safe seed job digests in one request. Results were plausibly ordered: Staff AI Platform 98, AI Product 93, Senior Backend 57, Data Scientist 3, Junior Designer 0. No input content or key was logged.

## 2026-10-24 01:08 — F8 cron and source foundation

- Cloudflare's current module Worker contract is `scheduled(controller, env, ctx)`, and Wrangler's current local trigger is `/cdn-cgi/local/scheduled`; the older `wrangler dev --test-scheduled` flag remains supported. Production registers the three §11 cron strings exactly: jobs every four hours, HN threads daily, and news daily. Sources: [Scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/), [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- Greenhouse's public Job Board API remains an unauthenticated `GET /v1/boards/{board_token}/jobs`; `content=true` adds full HTML descriptions. The verified `anthropic` token returns the official jobs shape, while the speculative `openai` token returns 404. Foundation uses Anthropic without descriptions for a bounded sub-1 MB cron response; P0-A owns broader verified board coverage and description-rich batches. Source: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html).
- `src/sources/registry.ts` predeclares all planned job and news source IDs before its F9 freeze. Only `greenhouse_anthropic` performs network I/O in Foundation; the remaining adapters are intentional no-op seams for their P0/P1 owners.
- The required local scheduled run completed with `outcome: ok`, inserted 100 normalized Anthropic jobs, and recorded successful `fetch_runs` rows. A fixture test also proves one failing adapter records `error` while a peer still upserts successfully.

## 2026-10-24 01:24 — F9 onboarding gate feedback

- The empty dashboard is not an acceptable first-run experience. Before the Foundation freeze, `open_dashboard` may add first-run Profile routing and `src/mcp/server.ts` may add server instructions. P0-B remains the owner of all criteria tools, Profile onboarding UI, and `skills/onboarding/`; this logged exception prevents later agents from editing frozen registry, bridge, or tab contracts.
- Chosen experience: an empty Profile offers **Get started** (conversational criteria setup) or **See demo** (public-safe demo load). Do not auto-run on connection. Natural-language setup requests and future `NEEDS_CRITERIA` results enter the same flow.

## 2026-10-24 01:42 — Cloudflare types compatibility repair

- `@cloudflare/workers-types@5.20261024.1` publishes both a module-style `index.ts` and a global `index.d.ts` without a package `types` entry. TypeScript's bundler resolution selected `index.ts`, so the Foundation globals `D1Database` and `KVNamespace` disappeared even though the declaration file was installed. Pinning both compiler projects to `@cloudflare/workers-types/index.d.ts` restores the intended Worker globals when a web panel imports its tool output type, without weakening type safety or changing runtime code. This is a Foundation dependency compatibility repair made before the F9 tag.

## 2026-10-24 01:46 — Initial MCP App tool-result routing

- MCP Inspector proved that the panel can render before `ui/notifications/tool-result` arrives, so synchronous initial-output routing fell back to Today even when `start_onboarding` returned `tab: profile`. The shared bridge now exposes a read-only tool-output subscription and the shell routes when that notification arrives. This repairs all tool-selected tabs before the F9 freeze without adding a timer or host-specific API.

## 2026-10-24 01:49 — Generated panel freeze exception

- `src/mcp/panel-html.generated.ts` is the deterministic output of `npm run build:web`; every feature panel must refresh it for deployment. It is the sole build-only exception to the frozen `src/mcp/*` ownership rule: feature branches may commit changes produced by `scripts/embed-panel.mjs`, but must never hand-edit the file. Foundation tool tests assert the six core tools remain present instead of freezing the total tool count as P0/P1 features register their own tools.

## 2026-10-24 10:25 — Learning Journal schema reservation

- Todd approved a future first-class Learning Journal for talks, courses, articles, experiments, and reflections. It is a quick-reference knowledge record with source links, takeaways, follow-up questions, and next actions; it is intentionally distinct from CRM-oriented generic notes.
- Foundation reserves `learning_entries` before the F9 schema freeze and includes it in caller-isolated reset semantics. No journal tools or panel surface ship in this amendment.
- P1-I owns the future `features/learning/*` implementation and `skills/learning-journal/`; its tools must keep user identity in `ToolContext` and satisfy T1 isolation.

## 2026-10-24 10:36 — Foundation light-theme repair request

- P0-B visual verification found that the bridge correctly reports `light`, but the frozen Foundation shell only sets `data-theme` and leaves `color-scheme: light dark` on `:root`; the built panel therefore follows the OS palette instead of the host palette.
- Foundation should add explicit `.shell[data-theme="light"] { color-scheme: light; }` and `.shell[data-theme="dark"] { color-scheme: dark; }` rules in `web/src/styles.css`, verify both rendered states, rebuild the generated panel, and let P0-B rebase. No bridge or feature contract changes are required.

## 2026-10-24 10:50 — Shared shell copy simplification request

- Todd asked to remove generated-sounding and requirement-shaped language from the real user experience. P0-B will simplify every owned Profile, tour, onboarding, and status string, but the global subtitle `Less panic. Better queries. A path forward.`, persistent hope footer, `you@v0.1 · Foundation` label, and disabled `soon` navigation are part of the shared Foundation shell outside P0-B ownership.
- The integrator should remove the subtitle and persistent footer, replace or hide the internal milestone version label, and hide unavailable tabs from the normal user view. This is a presentation-only shell change: no bridge, tab ID, tool, resource, or data contract changes.
- Affected tasks: Foundation shell/integrator, P0-B presentation consistency, P0-F demo packaging.

## 2026-10-24 11:32 — Parallel feature rollout and navigation contract

- Todd approved a rolling parallel rollout rather than gated waves. Three isolated feature agents may work concurrently; the lead/integrator owns shared-contract changes, integration, production deploys, and ChatGPT verification. Slots are refilled as soon as a feature reaches its reviewed milestone.
- Demo-critical order is job sources plus Jobs/Decisions, AI News, Events, People, Prep, Today, Learning Journal, AI-native growth, Money, then the optional Agents API company dossier. Jobs may develop against the public snapshot while live sources land; Today can scaffold against typed fixtures but integrates only after producer tool shapes stabilize.
- Decisions API remains product-visible in Jobs ranking and the AI-native growth assessment. The OpenAI Agents API is reserved for an optional budget-capped company dossier launched from Jobs/Prep; it is unrelated to the Cloudflare `agents` transport package and to Codex implementation subagents.
- Approved information architecture: frequent workflows are Today, Jobs, People, Prep, and Learn. Learn groups Journal, News, Events, and the renamed Growth plan. Profile and Settings are utility destinations; Money moves to secondary planning tools rather than permanent primary navigation.
- Contract repair required: every non-Foundation feature `index.ts` is still a `tools: []` stub even though PLAN F4 says feature registration seams were prewired. Feature owners must not edit these shared/frozen seams. The integrator may update feature `index.ts` exports and `web/src/tabs.ts` centrally after reviewed branches land, preserving tool contracts and hiding unfinished destinations.
- Affected tasks: P0-A, P0-C, P0-D, P0-E, P0-F, P1-B, P1-C, P1-D, P1-E, P1-G, P1-H, P1-I, Foundation integrator.

## 2026-10-24 11:37 — Decisions timeout remains inside the tool budget

- P0-C found that the Foundation Decisions wrapper always allowed 15 seconds per batch, while every product tool must return in roughly eight seconds. `scoreFit` now accepts an optional bounded `timeoutMs` (1–15 seconds) and retains 15 seconds as the backward-compatible default for smoke and non-tool callers.
- Jobs will request a six-second timeout. A timeout still follows the existing per-batch heuristic fallback, so no detached promise can record usage after the tool already returned.
- Affected tasks: F7 shared wrapper, P0-C Jobs scoring, P1-H AI-native assessment.

## 2026-10-24 11:55 — Typed MCP errors stay outside success output schemas

- MCP Inspector exposed that some clients validate `structuredContent` against a tool's advertised success `outputSchema` even when `isError` is true. The server SDK correctly skips output validation for error results, but emitting a different structured error object is not portable across clients.
- `fail(code, message, hint)` now keeps model-readable text in `content`, omits `structuredContent`, and places the machine-readable error in tool-result `_meta["self-deprecation/error"]`. The panel bridge reads that private metadata and retains the same typed error UI; success schemas remain precise and unchanged.
- This is a centralized Foundation compatibility repair. Feature owners should continue using `fail(...)` and must not widen every success schema independently.
- Affected tasks: F4/F5 shared result and bridge contracts, every typed MCP tool, P1-B Inspector verification.

## 2026-10-24 12:08 — External response limits are enforced while streaming

- P1-B review proved the shared `fetchWithTimeout` helper buffered an entire response before applying `maxBytes` when `Content-Length` was absent. That allowed an untrusted upstream to consume Worker memory beyond the declared limit.
- The helper now reads the response stream incrementally, cancels it immediately after the byte limit is crossed, and only constructs the returned response from bounded chunks. Declared oversized responses still fail before reading.
- Affected tasks: shared HTTP foundation, all source adapters, P0-A jobs, P1-B event metadata, P1-C news.

## 2026-10-24 — P0-A verified feed contracts and integration requests

- Verified official contracts: [Greenhouse](https://docs.greenhouse.io/job-board), [Lever](https://github.com/lever/postings-api), [Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api), [Remote OK](https://remoteok.com/api), [Remotive](https://remotive.com/remote-jobs/api), [Adzuna](https://developer.adzuna.com/docs/search). ATS GET feeds are public; no universal published ATS quota was established, so use one request per board, bounded rotating batches, and no retries. Greenhouse content is double-escaped HTML. Ashby `isRemote` includes hybrid; use `workplaceType`. Only annual base compensation maps to annual salary fields.
- 30 public ATS boards verified on 2026-10-24, recorded with counts in seed/ats-boards.json. Excluded the `weave` Greenhouse token because its content identifies a different company. Large boards return 8–14 MB; adapters cap at 20 MB and normalize only the selected jobs. Workers Free CPU remains a deployment measurement, not proven safe by unit tests.
- [contract] Foundation jobs/index.ts has `tools: []`. Integrator: import `catalogTools` from catalog-tools.ts alongside P0-C tools; wire `runRotatingJobBatch(env)` into the jobs cron instead of fetching all static job adapters, and document refresh_jobs in docs/TOOLS.md. The service rotates ten boards and throttles Remotive to six hours; the frozen default dispatcher does neither.
- [contract] Remotive and Remote OK require source attribution and links back. Adapters preserve source IDs and source listing URLs. P0-C: render visible source labels (`Remote OK`, `Remotive`) with those URLs; Remotive listings are delayed by 24h. Do not render employer apply links in place of source links for these feeds.
- [local] Fixture free-text descriptions are synthetic; only public listing metadata and API shapes are retained. Snapshot generation excludes all original descriptions/contact data and uses plain metadata-based summaries.

## 2026-10-24 — P0-A conservative source budget and runtime check

- Integrator ruling supersedes the earlier 20 MB allowance: normal fetches cap responses at **2 MB**, use ≤5-second source timeouts, and exclude the 14 verified boards above that size from rotation. Sixteen smaller boards supply 1,003 normalized jobs across Greenhouse (605), Lever (22), and Ashby (376); the public snapshot selects 60 relevant roles with 20 per Utah/AI/remote group. Large OpenAI/Anthropic boards remain listed but explicitly skipped as `RESPONSE_TOO_LARGE`.
- Manual local Worker smoke exposed that Workers rejects RequestInit `redirect: "error"` at runtime. Use supported `manual` mode and reject non-2xx responses, retaining the fixed-host boundary. Added a red-first T7 regression test for this case.
- [contract] `runRotatingJobBatch` and `refreshJobs` export results with `{ tab: 'jobs', itemsUpserted, sources, progress, fallback, skipped, snapshotCapturedAt? }`. Source reasons are sanitized codes; no raw exception text is persisted. `catalogTools` exports refresh_jobs and `refreshOutputSchema`; these remain unregistered until the integrator's jobs/index.ts change.
- [contract] Adzuna is US-only as specified by §11.1 and uses the caller's first target title/location, with a six-hour query/location hash in fetch_runs. Per-user on-demand refresh is implemented. A daily active-users Adzuna sweep requires an integrator-owned cron/user-activity contract; no user table scan or new shared schema was introduced in P0-A.
- Local Worker + isolated D1 smoke: 529 live jobs persisted from nine successful boards across all three ATS families in 672 ms; a tenth board exceeded the runtime response limit and recorded an error without interrupting the rest. Snapshot rows preserve original source/key identities and add a `snapshot` tag, so later live refreshes replace them in place without breaking saved match identities. Fallback dates remain the capture date, including repeated offline refreshes.
- Concurrent Adzuna refreshes now use an atomic conditional INSERT in fetch_runs before starting the HTTP call. A recent success reuses six-hour results; an in-flight claim suppresses duplicate calls for ten seconds and is surfaced as `FETCH_IN_PROGRESS`. A terminated Worker therefore cannot leave a permanent lock. This uses the existing global table, with no schema or user-data changes.
