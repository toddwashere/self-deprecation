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
- **Testing package VERIFY:** Cloudflare renamed `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin` in August 2026 with the configuration API unchanged. Foundation uses the supported `@cloudflare/vitest-plugin@1.4.7`. Source: [Cloudflare migration notice](https://developers.cloudflare.com/changelog/post/2026-08-19-vitest-plugin/).
