# Self-Deprecation — Build Plan

> *Finding a job, or keeping a career, in the age of AI.*
>
> `@deprecated since 2026 — not removed yet.`

**Status:** Plan v1 — written Fri Oct 23, 2026, ~11 p.m. MT
**Event:** Codex DevDay Hackathon, Boostly (Lehi, UT). **Track 2: Build Inside ChatGPT.**
**Code freeze:** Sat Oct 24, 3:00 p.m. MT. Judging in person, 3-minute demo.
**Owner / demo persona:** Todd Fisher (real resume, real search).

This is the single source of truth for building the POC. Agents (Codex, Claude, or others) should read
`AGENTS.md` first, then the section of this plan for their task ID. Anything marked **VERIFY** was not
confirmed while planning and must be checked against current docs before relying on it.

---

## Table of contents

1. Product
2. Rubric map (how we score points)
3. Architecture
4. Who does the AI work (cost model)
5. Tech stack
6. Repository layout
7. Data model (frozen after Foundation)
8. Core contracts (frozen after Foundation)
9. Auth and multi-user design
10. ChatGPT surface: tools, panel, skills, extensions
11. Job, news, and event sources
12. Decisions API scoring design
13. Error handling and failure modes
14. Security and privacy
15. Configuration, secrets, environments
16. Human setup checklist (Todd)
17. Work breakdown: Foundation → P0 → P1 → P2
18. Parallel execution and ownership map
19. Timeline
20. Demo script (3 minutes)
21. Risks and fallbacks
22. Open questions / VERIFY list
23. Appendices (Decisions example, skill drafts, seed persona)
24. Voice and humor guide ("laugh, then wince, then hope")
25. The AI-Native Ladder (career level feature)
26. Planning protocol and decisions that need Todd
27. Progress and status UX
28. Company interview intel ("know the gauntlet")
29. Testing strategy (minimal, high-value)
30. Audience invite ("try it right now")
31. Speed strategy: precompute, don't cache

---

## 1. Product

### 1.1 The user and the problem

Software engineers are job hunting in a market that AI is reshaping. They juggle a dozen job boards,
lose track of people they meet, under-prepare for interviews, can't keep up with AI news that
determines what employers want, and increasingly bridge gaps with contract work, or leave
full-time work for independent contracting on purpose.

**Self-Deprecation** is a career copilot that lives *inside ChatGPT*. ChatGPT's own model (on the
user's plan) does the conversation and writing. Our plugin supplies the data, memory, scoring,
and a persistent side panel.

### 1.2 Core loop (demo-critical)

1. **Tell it what you want.** Criteria via chat, a form, and/or a resume.
2. **It scans.** Public job feeds are pulled on a schedule by our server (no LLM cost).
3. **It ranks.** The Decisions API scores each job's fit for *you* (0–100), with code-derived "why" chips.
4. **You act.** Save or dismiss, track status, add the people you meet, take notes.
5. **You prepare.** Per-job interview prep and a voice mock interview, run by ChatGPT.
6. **It keeps you current.** A daily brief (new matches, contract leads, events, follow-ups, AI news),
   runnable on a schedule via ChatGPT scheduled tasks.

### 1.3 Modes

- **Search mode** (default): full-time roles.
- **Bridge mode**: "I'm between roles, show me contract work too." Contract leads appear next to jobs,
  framed as temporary.
- **Indie mode** (roadmap): contracting is the plan, not a stopgap. Rate/runway calculators, contract
  pipeline, proposals, case studies.

### 1.4 Feature tiers

| Tier | Meaning |
|---|---|
| **F, Foundation** | Scaffolding everything else builds on. Built first, serially. Must be proven in real ChatGPT before fan-out. |
| **P0, Must work in demo** | The demo script depends only on these. Built in parallel after F. |
| **P1, Build if time** | Built in parallel once P0 is green. Each must fail gracefully if unfinished (hide its tab). |
| **P2, Roadmap** | Shown on the final slide. Some have schema support already. |

Feature list by tier (details in §17):

- **F:** Cloudflare Worker + D1 + Drizzle, GitHub OAuth, user/identity model, feature registry,
  panel shell, core tools (`get_profile`, `reset_my_data`, `load_demo_data`, `open_dashboard`),
  Decisions wrapper, cron dispatcher, source adapter interface, seed data, tests.
- **P0:** job sources + normalization · criteria/profile/resume · Decisions scoring + Jobs tab ·
  basic CRM (contacts + notes) · interview prep + mock interview skills · **company interview intel**
  (what this company's loop actually looks like: coding/LeetCode-style patterns, system design prompts,
  behavioral themes, from public reports; §28) · plugin packaging, skills,
  demo seed, demo script.
- **P1:** Bridge mode + contract leads · events (ChatGPT web search → saved events) · AI news
  aggregator (tool + skill) · daily brief + scheduled-task setup + "Run my brief" fallback ·
  rate & runway calculators · **AI-Native Ladder** (where you are on the journey to AI-native
  engineering, and quests to reach the next level) · native plugin settings + extended forms onboarding ·
  *(optional)* Agents API company dossier.
- **P2:** skill-shift radar · adjacent-role fit · contract pipeline · portfolio case studies ·
  composer @-mentions · resume file viewer · Google login + account linking · Meetup API ·
  Indie mode.

---

## 2. Rubric map (how we score points)

| Criterion (pts) | How we earn it |
|---|---|
| Working demo (30) | One rehearsed live path (§20), deployed server (no tunnel), reset + load demo data before going on stage, every step visible in the panel. |
| Usefulness (25) | Real user (Todd), real problem, real jobs. Show time saved: "12 boards → one ranked list." |
| Use of OpenAI tools (25) | Plugin extensions (sidebar + conversation panel), plugin skills, scheduled tasks, Decisions API scoring (jobs + AI-Native level), voice mode via skill; optional Agents API dossier. |
| Technical quality (10) | Interface, tools, and data visibly connected. Explicitly show failure handling: a source down → "source unavailable" chip; Decisions down → keyword fallback score; missing criteria → onboarding prompt. |
| Presentation (10) | 30s problem / 2m live / 30s tech + limitations (§20). |

---

## 3. Architecture

```
┌──────────────────────── ChatGPT desktop (user's Pro plan) ───────────────────────┐
│  Chat + ChatGPT model (writing, summarizing, prep, web search for events)         │
│  Plugin "Self-Deprecation": skills  ·  sidebar app  ·  conversation panel (React) │
│  Scheduled tasks ($daily-brief, $weekly-ai-news)                                   │
└───────────────┬───────────────────────────────────────────────────────────────────┘
                │ MCP (streamable HTTP) + OAuth 2.1 bearer token
                ▼
┌──────────── Cloudflare Worker: self-deprecation (workers.dev, HTTPS) ─────────────┐
│ workers-oauth-provider ──► /authorize, /token, /register, /.well-known/*           │
│        │ upstream login: GitHub OAuth (src/auth/github-handler.ts)                 │
│        ▼                                                                            │
│ /mcp ──► MCP server ──► feature registry ──► features/*/tools.ts                   │
│                │                      │                                             │
│                │ ToolContext{userId}  ├─► repositories (always user-scoped) ─► D1  │
│                │                      └─► lib/decisions.ts ─► OpenAI Decisions API  │
│                └─► UI resource ui://self-deprecation/panel (single-file React)      │
│ scheduled() ──► cron dispatcher ──► source adapters ──► public feeds ─► D1 (global) │
└────────────────────────────────────────────────────────────────────────────────────┘
       D1 (SQLite): users, identities, profiles, jobs, job_matches, contacts, notes, …
       KV: OAUTH_KV (OAuth grants/tokens, used by workers-oauth-provider)
```

Principles:

- **ChatGPT finds and writes; our server stores and shows.** Generation runs on the user's plan.
- **Global vs. user data.** Public catalogs (`jobs`, `news_items`, `fetch_runs`) are global and
  shared. Everything personal is user-scoped by `user_id`, and user IDs come only from the verified
  OAuth grant.
- **The panel talks only to tools.** No separate REST API for the UI. Same tools, same auth, same
  validation.
- **Features are plug-ins to our own server.** Each feature owns a folder; core loads it via a
  pre-declared registry, so parallel agents never edit shared files.

---

## 4. Who does the AI work (cost model)

| Work | Done by | Cost to us |
|---|---|---|
| Conversation, criteria Q&A, resume extraction, prep questions, mock interview, outreach drafts, brief and news summaries | ChatGPT (user's plan) via skills + tool results | $0 |
| Event discovery | ChatGPT web search, then `save_event` | $0 |
| Fetching jobs/news | Our code (cron + `refresh_jobs`) | $0 (Workers free plan; see CPU risk) |
| Hard filters + "why" chips (remote, salary, stack overlap) | Our code | $0 |
| Fit scoring | **Decisions API** (`gpt-6-luna`), our key | Uncached input $0.10 / 1M tokens; output not charged |
| Company dossier (optional, P1) | Agents API, our key, hard budget cap | Small; capped per user per day |

---

## 5. Tech stack

Verify current versions at install time; pin what you install.

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | One language across server, panel, scripts. |
| Runtime/host | Cloudflare Workers (`wrangler`) | `nodejs_compat` flag on. Free plan to start; $5 Workers Paid if CPU limits bite. |
| DB | Cloudflare D1 (SQLite) | Local dev via `wrangler dev` (local SQLite). |
| ORM/migrations | Drizzle ORM + drizzle-kit (D1 driver) | Schema in TS = shared contract. |
| Validation | zod | Tool inputs/outputs. |
| MCP server | `@modelcontextprotocol/sdk` + MCP Apps (`@modelcontextprotocol/ext-apps/server`, `registerAppTool`) + OpenAI `@openai/mcp-extensions` for ChatGPT-only extensions (entrypoints, settings, forms) | Per OpenAI's plugin reference: use the open MCP Apps standard first (`_meta.ui.resourceUri`, UI resource mime `text/html;profile=mcp-app`), `window.openai` / `_meta["openai/*"]` only for ChatGPT-specific features. **VERIFY** exact package versions. |
| MCP transport on Workers | Cloudflare `agents` `McpAgent` (Durable Object) **or** stateless streamable HTTP | Decide in F1 spike; prefer whatever the Cloudflare remote-MCP GitHub-OAuth template uses. |
| OAuth | `@cloudflare/workers-oauth-provider` + GitHub OAuth App | Start from Cloudflare's `remote-mcp-github-oauth` template (**VERIFY** current name). |
| OpenAI | `openai` npm SDK (`client.decisions.create`) | Decisions API, optional Agents API. |
| Panel UI | React + Vite, built to a **single HTML file** (e.g. `vite-plugin-singlefile`) | Served as the MCP UI resource. Target < 400 KB. |
| Panel host bridge | MCP Apps bridge, falling back to `window.openai` (`callTool`, `sendFollowUpMessage`, `toolOutput`, `widgetState`/`setWidgetState`, `theme`, `notifyIntrinsicHeight`, `requestDisplayMode`, `openExternal`) | Wrapped once in `web/src/bridge.ts`. |
| Tests | vitest (+ `@cloudflare/vitest-pool-workers` for Worker/D1 tests) | Keep tests fast; seed DB per test. |
| Feeds | `fetch` + small parsers (`fast-xml-parser` for RSS/Atom) | Watch CPU time. |
| Lint/format | Biome (or ESLint + Prettier) | Pick one in F1; don't bikeshed. |

---

## 6. Repository layout

```
/
├─ AGENTS.md                 # rules for all coding agents (read first)
├─ CLAUDE.md                 # points Claude Code at AGENTS.md
├─ README.md
├─ docs/
│  ├─ PLAN.md                # this file
│  ├─ DEMO.md                # demo script + reset checklist (P0-F)
│  ├─ TOOLS.md               # generated/maintained tool catalog (F4 creates, features append)
│  └─ decisions-log.md       # contract-change requests + architecture decisions (append-only)
├─ package.json  tsconfig.json  biome.json
├─ wrangler.jsonc            # Worker config: D1, KV, DO (if McpAgent), crons, vars
├─ drizzle.config.ts
├─ migrations/               # drizzle-kit output (F3 owns; frozen after F)
├─ seed/
│  ├─ demo-todd.json         # demo persona: profile, contacts, notes, saved events
│  ├─ jobs-snapshot.json     # ~60 real jobs captured from feeds, for offline/demo fallback
│  ├─ news-snapshot.json
│  └─ ats-boards.json        # verified Greenhouse/Lever/Ashby board tokens
├─ skills/                   # ChatGPT plugin skills (each a folder with SKILL.md)
│  ├─ onboarding/  daily-brief/  weekly-ai-news/  interview-prep/
│  ├─ mock-interview/  interview-intel/  outreach/  find-events/  level-up/
├─ plugin/                   # plugin package + local marketplace entry (P0-F, via plugin-creator)
├─ scripts/                  # db:reset, seed, snapshot-feeds, smoke tests
├─ src/
│  ├─ index.ts               # Worker entry: OAuthProvider wrapper, fetch + scheduled handlers
│  ├─ env.ts                 # Env bindings type
│  ├─ auth/
│  │  ├─ github-handler.ts   # upstream GitHub login + callback → identity upsert
│  │  └─ identity.ts         # findOrCreateUserByIdentity()
│  ├─ mcp/
│  │  ├─ server.ts           # builds MCP server, registers all feature tools + UI resource
│  │  ├─ registry.ts         # FEATURES list (pre-populated in F; agents don't edit)
│  │  ├─ types.ts            # FeatureModule, ToolDef, ToolContext
│  │  ├─ result.ts           # ok()/fail()/needsAuth() helpers
│  │  └─ ui-resource.ts      # ui://self-deprecation/panel registration + entrypoint meta
│  ├─ db/
│  │  ├─ client.ts           # drizzle(env.DB)
│  │  └─ schema.ts           # ALL tables (frozen after F3)
│  ├─ lib/
│  │  ├─ decisions.ts        # Decisions API wrapper (F8) + heuristic fallback
│  │  ├─ http.ts             # fetchWithTimeout, size caps, host allowlist
│  │  ├─ ids.ts  time.ts  log.ts  errors.ts
│  ├─ sources/
│  │  ├─ types.ts            # SourceAdapter, NormalizedJob, NormalizedNews
│  │  └─ registry.ts         # SOURCES list (pre-populated stubs in F)
│  ├─ cron/
│  │  └─ dispatcher.ts       # maps cron expressions → jobs; records fetch_runs
│  └─ features/              # one folder per feature; each exports a FeatureModule
│     ├─ core/       criteria/    jobs/       scoring/     crm/
│     ├─ prep/       contracts/   events/     news/        brief/
│     ├─ calculators/  dossier/  ladder/
│     └─ <feature>/{index.ts, tools.ts, repo.ts, service.ts, panel.tsx, *.test.ts}
└─ web/                      # panel app
   ├─ index.html  vite.config.ts
   └─ src/
      ├─ main.tsx  app.tsx   # shell: header, tab bar, routing, theme
      ├─ bridge.ts           # ONLY place that touches the host API
      ├─ tabs.ts             # TABS list (pre-populated in F; imports features/*/panel.tsx)
      └─ ui/                 # shared components: Card, Chip, Button, Empty, ErrorBanner, Form
```

Feature folders contain **both** server code and their panel tab (`panel.tsx`), so one agent can own a
feature end to end without touching anyone else's files.

---

## 7. Data model (frozen after Foundation)

All IDs are text (ULID or `crypto.randomUUID()`). Timestamps are integer epoch ms. JSON columns
are text with `mode: 'json'` in Drizzle. **The full schema below is created in F3, including
P1 tables**, so parallel agents never generate competing migrations. Need a change? Add an entry to
`docs/decisions-log.md` and ping the integrator (see AGENTS.md). Prefer `extra` JSON columns over
schema changes during the hackathon.

### 7.1 Identity (one user → many login identities)

```
users
  id                text PK
  display_name      text
  email             text            -- display only, never identity
  avatar_url        text
  is_demo           int  default 0  -- 1 for seeded demo users
  created_at, updated_at

auth_identities                     -- one row per (provider account); many per user
  id                text PK
  user_id           text FK → users.id  ON DELETE CASCADE
  provider          text            -- 'github' now; 'google' | 'email' | … later
  provider_user_id  text            -- immutable provider subject (GitHub numeric id as string, Google `sub`)
  email             text
  email_verified    int
  username          text            -- e.g. GitHub login
  created_at, last_login_at
  UNIQUE(provider, provider_user_id)
  INDEX(user_id)
```

Future account linking (P2): a signed-in user starts "Connect Google" → upstream login → insert a
second `auth_identities` row with the *current* `user_id`. Never auto-merge accounts by email.

### 7.2 Profile and criteria (1:1 with user)

```
profiles
  user_id           text PK FK → users.id ON DELETE CASCADE
  headline          text            -- "Senior software engineer, backend + AI"
  summary           text
  target_titles     json  string[]
  seniority         text            -- 'junior'|'mid'|'senior'|'staff'|'principal'|'manager'
  locations         json  string[]  -- e.g. ["Salt Lake City, UT", "Remote US"]
  remote_pref       text            -- 'remote'|'hybrid'|'onsite'|'any'
  salary_min        int             -- annual USD
  hourly_min        int             -- contract USD/hr
  employment_types  json  string[]  -- ['full_time','contract','part_time']
  skills            json  string[]  -- normalized lowercase
  avoid             json  { companies: string[], industries: string[], keywords: string[] }
  bridge_mode       int  default 0
  timezone          text  default 'America/Denver'
  resume_text       text            -- ≤ 50 KB, never logged
  resume_updated_at int
  criteria_version  int  default 1  -- bump on any criteria change → invalidates scores
  extra             json
  updated_at
```

### 7.3 Global catalogs (not user-scoped; public data)

```
jobs
  id                text PK
  source            text            -- 'greenhouse'|'lever'|'ashby'|'remoteok'|'remotive'|'hn_hiring'|'hn_freelance'|'arbeitnow'|'seed'
  source_job_id     text
  company           text
  title             text
  location          text
  remote            int             -- 0/1/NULL unknown
  employment_type   text            -- 'full_time'|'contract'|'part_time'|'unknown'
  salary_min, salary_max  int
  currency          text
  url               text
  description_text  text            -- plain text, truncated to 8 KB
  tags              json  string[]  -- extracted skills/keywords (lowercase)
  posted_at, fetched_at, last_seen_at  int
  content_hash      text
  UNIQUE(source, source_job_id)
  INDEX(fetched_at), INDEX(employment_type)

news_items
  id, source, title, url UNIQUE, snippet (≤ 500 chars), author,
  published_at, fetched_at, tags json, score int (e.g. HN points)

fetch_runs                          -- observability + "source unavailable" chips
  id, source, kind ('jobs'|'news'), started_at, finished_at,
  status ('ok'|'error'|'partial'), items_upserted int, error text
```

### 7.4 User-scoped data

```
job_matches                         -- a user's view of a job; also the score cache
  id                text PK
  user_id           text FK
  job_id            text FK → jobs.id
  fit_score         int  NULL       -- 0–100; NULL = unscored
  score_source      text            -- 'decisions'|'heuristic'
  score_detail      json            -- { levels:[…], seniority_p, stack_p, confidence }
  reasons           json  string[]  -- code-derived chips: "Remote ✓", "Python, Postgres", "$190k+"
  criteria_version  int
  status            text default 'new'  -- 'new'|'saved'|'applied'|'interviewing'|'offer'|'rejected'|'dismissed'
  scored_at, updated_at
  UNIQUE(user_id, job_id)
  INDEX(user_id, fit_score)

contacts
  id, user_id, name, company, title, email, linkedin_url, where_met,
  tags json, last_contacted_at, follow_up_at, extra json, created_at, updated_at
  INDEX(user_id)

notes                               -- generic, attachable to anything
  id, user_id,
  subject_type  text  -- 'contact'|'company'|'job'|'event'|'general'
  subject_id    text NULL
  subject_label text  -- e.g. company name when there's no row
  kind          text  default 'note'  -- 'note'|'prep'|'outreach_draft'|'dossier'|'brief'
  title text, body text (markdown), created_at, updated_at
  INDEX(user_id, subject_type, subject_id)

saved_events
  id, user_id, title, url, starts_at, ends_at, venue, city,
  source ('chatgpt_search'|'manual'|'meetup'|'luma'), status ('interested'|'going'|'attended'|'skipped'),
  notes, created_at, updated_at
  INDEX(user_id, starts_at)

user_state                          -- small per-user key/value for UI and brief bookkeeping
  user_id, key, value json, updated_at     PK(user_id, key)
  -- e.g. 'brief.last_seen_at', 'panel.last_tab', 'onboarding.done'

ladder_assessments                  -- AI-Native Ladder (§25); one row per assessment
  id, user_id, level int (1–5), level_p json  -- per-level probabilities from Decisions `choice`
  dimension_scores json  -- { tooling, delegation, verification, parallelism, automation } each 0–4
  answers json           -- the self-assessment answers (no free text > 2 KB)
  source text            -- 'decisions'|'heuristic'|'self'
  created_at
  INDEX(user_id, created_at)

ladder_quests                       -- progress on next-level "quests"
  id, user_id, quest_id text (from static catalog), level int,
  status text ('todo'|'doing'|'done'|'skipped'), evidence text (≤ 2 KB), completed_at, updated_at
  UNIQUE(user_id, quest_id)

api_usage                           -- spend guardrails
  id, user_id, api ('decisions'|'agents'), units int, input_tokens int, created_at
  INDEX(user_id, api, created_at)
```

**Reset semantics (`reset_my_data`):** delete the user's rows from `job_matches`, `contacts`,
`notes`, `saved_events`, `user_state`, `ladder_assessments`, `ladder_quests`, `api_usage`; reset `profiles` to an empty row (bump
`criteria_version`). Keep `users` and `auth_identities`. Never touch global tables.

---

## 8. Core contracts (frozen after Foundation)

### 8.1 Feature modules (server)

```ts
// src/mcp/types.ts
export interface ToolContext {
  userId: string;            // from verified OAuth props ONLY
  db: DB;                    // drizzle instance
  env: Env;
  now: () => Date;
  log: Logger;               // never log resume text, notes bodies, or tokens
}

export interface ToolDef<I extends z.ZodRawShape = z.ZodRawShape> {
  name: string;              // snake_case, globally unique, verb_noun: "search_jobs"
  title: string;
  description: string;       // written for the model: when to use, when NOT to use
  input: I;
  output?: z.ZodTypeAny;     // structuredContent schema
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean; idempotentHint?: boolean }; // first three required by ChatGPT
  status: { invoking: string; invoked: string };  // ≤ 64 chars each → _meta["openai/toolInvocation/*"] (§27)
  opensPanel?: boolean;      // attach UI resource meta so ChatGPT can render the panel
  handler: (args: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface CronJob { id: string; cron: string; run: (env: Env) => Promise<void> }

export interface FeatureModule {
  id: string;                // matches folder name
  tools: ToolDef[];
  cron?: CronJob[];
}
```

- `src/mcp/registry.ts` imports every `src/features/*/index.ts` (stubs created in F with
  `tools: []`). **Feature agents edit only their own folder.**
- Every tool declares `securitySchemes: [{ type: "oauth2" }]` (added centrally in `server.ts`).
- `ToolResult` helpers in `src/mcp/result.ts`:
  - `ok(text, structured)` → `{ content: [{type:"text", text}], structuredContent: structured }`
    The `text` is a short model-readable summary; `structured` is what the panel renders.
  - `fail(code, message, hint?)` → `isError: true` with a user-actionable message.
    Codes: `NEEDS_CRITERIA`, `NOT_FOUND`, `SOURCE_UNAVAILABLE`, `SCORING_UNAVAILABLE`,
    `RATE_LIMITED`, `INVALID_INPUT`, `INTERNAL`.
  - `needsAuth()` → error result with `_meta["mcp/www_authenticate"]` (see §9).

### 8.2 Repositories (data access)

- One `repo.ts` per feature. Every exported function takes `(db, userId, …)` for user-scoped tables
  and adds `eq(table.userId, userId)` to **every** query, including updates and deletes by ID
  (`WHERE id = ? AND user_id = ?`).
- Global-table repos (`jobs`, `news_items`, `fetch_runs`) take no `userId` and live in
  `features/jobs/repo.ts` / `features/news/repo.ts`.
- No raw SQL outside repos. No tool handler touches `db` directly.
- A shared test helper asserts isolation: create users A and B, write as A, read as B → empty.

### 8.3 Source adapters

```ts
// src/sources/types.ts
export interface NormalizedJob {
  source: string; sourceJobId: string; company: string; title: string;
  location?: string; remote?: boolean; employmentType: 'full_time'|'contract'|'part_time'|'unknown';
  salaryMin?: number; salaryMax?: number; currency?: string;
  url: string; descriptionText?: string; tags?: string[]; postedAt?: number;
}
export interface NormalizedNews {
  source: string; title: string; url: string; snippet?: string;
  author?: string; publishedAt?: number; tags?: string[]; score?: number;
}
export interface SourceAdapter<T> {
  id: string;                  // 'greenhouse', 'hn_hiring', 'hf_blog', …
  kind: 'jobs' | 'news';
  fetch(env: Env, opts: { since?: number; limit?: number }): Promise<T[]>;  // throws on failure
}
```

Rules: `fetchWithTimeout` (8s) from `lib/http.ts`; host allowlist; truncate descriptions; strip HTML
to text; tag extraction via a shared skills dictionary (`src/lib/skills-dict.ts`, created in F).

### 8.4 Panel tabs (web)

```ts
// web/src/tabs.ts  (pre-populated in F)
export interface TabDef {
  id: 'today'|'jobs'|'people'|'prep'|'events'|'news'|'money'|'level'|'profile'|'settings';
  label: string;
  component: React.ComponentType<{ bridge: Bridge }>;
  enabled: boolean;            // P1 tabs ship enabled:false until ready
}
```

```ts
// web/src/bridge.ts  (the ONLY file that touches the host API)
export interface Bridge {
  callTool<T>(name: string, args?: object): Promise<{ data?: T; error?: { code: string; message: string } }>;
  sendPrompt(text: string): Promise<void>;     // hand off to ChatGPT ("Prep me for this job")
  initialToolOutput<T>(): T | undefined;       // structuredContent of the tool that opened the panel
  theme(): 'light' | 'dark';
  saveViewState(state: object): void;          // window.openai.setWidgetState (remember tab/filters)
  openExternal(url: string): void;             // job/apply links
}
// Implementation prefers the MCP Apps bridge (tools/call etc.), falls back to window.openai.* (see OpenAI plugin reference).
```

Each feature's `panel.tsx` renders from `bridge.callTool(...)` results and uses `web/src/ui/*`
components. **Tool result `structured` shapes are the contract between server and panel**: define
them as zod schemas in the feature's `tools.ts` and export the inferred types for `panel.tsx`.

### 8.5 Decisions wrapper

```ts
// src/lib/decisions.ts  (F8)
export interface FitInput  { jobId: string; jobText: string }       // jobDigest(): ≤ ~1.5 KB per job
// scoreFit() splits inputs into batches of DECISIONS_BATCH_SIZE (default 20), runs ≤ DECISIONS_CONCURRENCY (3) at once,
// and falls back to heuristicFit() per failed batch.
export interface FitResult { jobId: string; score: number | null;     // 0–100
                             seniorityP?: number; stackP?: number; confidence?: number;
                             source: 'decisions' | 'heuristic' }
export async function scoreFit(env: Env, profileText: string, jobs: FitInput[]): Promise<FitResult[]>;
export function heuristicFit(profile: Profile, job: Job): FitResult;  // keyword/stack overlap fallback
```

---

## 9. Auth and multi-user design

**Login:** GitHub OAuth via `@cloudflare/workers-oauth-provider`. Our Worker is both an OAuth 2.1
authorization server (for ChatGPT) and an OAuth client (to GitHub). Start from Cloudflare's
remote-MCP GitHub OAuth template.

**What ChatGPT requires** (from OpenAI plugin auth docs; F2 must verify each against the template):

- Protected resource metadata at `GET /.well-known/oauth-protected-resource` with `resource` (our
  canonical HTTPS URL) and `authorization_servers`.
- Authorization server metadata at `/.well-known/oauth-authorization-server` (or OIDC discovery)
  with `authorization_endpoint`, `token_endpoint`, `registration_endpoint` (DCR),
  `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported` incl. `"none"`.
- Echo the `resource` parameter; tokens must be minted for our resource (audience check).
- Unauthenticated calls: 401 with `WWW-Authenticate: Bearer resource_metadata="…"`; tool-level
  challenge via `_meta["mcp/www_authenticate"]` with `error` and `error_description`.
- Per-tool `securitySchemes: [{ "type": "oauth2" }]`.
- Redirect URI allowlist: ChatGPT uses `https://chatgpt.com/connector/oauth/{callback_id}` unless the
  server meets RFC 9207 issuer identification, in which case it uses
  `https://chatgpt.com/connector_platform_oauth_redirect`. Copy the exact URI from the plugin's
  management page. *(This is ChatGPT → our Worker. GitHub's callback is separately our Worker's
  `/callback`.)*
- If the template lacks `resource` echoing or PRM, add it in F2; if blocked > 90 min, use the
  fallback in §21 (R2).

**Identity flow:** GitHub callback → fetch `GET https://api.github.com/user` (+ `/user/emails` for a
verified primary email) → `findOrCreateUserByIdentity('github', String(gh.id), {email, username,
name, avatar})` → store `{ userId }` as the grant's props → every MCP request resolves
`ctx.userId = props.userId`. **Tools never accept a user ID as an argument.**

**Profile tool:** `get_profile` returns `{ id: userId, name, email, nickname }`, is read-only, has
`_meta["openai/profile"]: true` and the profile `outputSchema`. This supports ChatGPT's
multi-account recognition for free.

**Local dev:** `DEV_AUTH_BYPASS=1` in `.dev.vars` makes `/mcp` accept unauthenticated calls as user
`dev-user` (created on first use). The Worker **refuses to start the bypass when
`ENVIRONMENT === "production"`**. MCP Inspector works locally without OAuth.

**Future providers:** Google (`sub` as `provider_user_id`), email magic link, or a hosted IdP
(Auth0/Stytch/WorkOS) slot into the same `auth_identities` table. No migration needed.

---

## 10. ChatGPT surface: tools, panel, skills, extensions

### 10.1 Extensions used

| Extension | Use | Tier |
|---|---|---|
| Sidebar app (`entrypoints: [{type:"global"}]`) | Open Self-Deprecation fullscreen from the ChatGPT sidebar | F |
| Conversation panel (`{type:"thread"}`) | Panel beside the chat; updates as tools run, the main demo surface | F |
| Plugin skills | Onboarding, brief, news, prep, mock interview, outreach, events | P0/P1 |
| Scheduled tasks | `$daily-brief` weekdays, `$weekly-ai-news` Mondays | P1 |
| Plugin settings (structured settings) | Native criteria form | P1 |
| Extended forms (form elicitation) | Interactive onboarding questions with native controls | P1 |
| Composer @-mentions | @ a saved job/contact into any chat (desktop) | P2 |
| File viewer | Open a resume PDF/DOCX in our panel | P2 |

**VERIFY** in the extensions spec: exact `_meta["openai/ui"]` shape, whether one UI resource can
back both global and thread entrypoints, and the panel-side API for calling tools and sending
prompts. Start from OpenAI's "Bits & Bolts" example plugin.

### 10.2 Tool catalog

All tools require OAuth unless noted. `RO` = readOnlyHint, `D` = destructiveHint.

| Tool | Tier | Hints | Purpose |
|---|---|---|---|
| `get_profile` | F | RO | Who am I (profile tool, `openai/profile`). |
| `open_dashboard` | F | RO, panel | Open the panel to a tab: `{tab?}`. Returns summary counts. |
| `reset_my_data` | F | D | Wipe the caller's personal data (requires `{confirm: "RESET"}`). |
| `load_demo_data` | F | — | Reset, then load `seed/demo-todd.json` into the caller's account. |
| `get_task_status` | F | RO | Progress for a long-running task ID (§27). |
| `get_criteria` | P0 | RO | Current criteria/profile (no resume text unless `{includeResume:true}`). |
| `update_criteria` | P0 | — | Partial update of profile fields; bumps `criteria_version`. |
| `save_resume` | P0 | — | `{text, extracted?: {skills, titles, seniority, …}}`. ChatGPT reads the user's resume and passes text + extraction. |
| `refresh_jobs` | P0 | openWorld | Pull a small, fast subset of sources now (demo button). Bounded. |
| `search_jobs` | P0 | RO, panel | Ranked matches: `{query?, minScore?, remote?, employmentType?, status?, limit?}`; scores unscored matches on demand. |
| `get_job` | P0 | RO | Full job + match + notes. |
| `update_job_status` | P0 | — | `{jobId, status}` (save/dismiss/applied/…). |
| `score_jobs` | P0 | — | Score up to N unscored candidates for the caller (also called by `search_jobs`). |
| `add_contact` / `update_contact` / `list_contacts` | P0 | — / — / RO | Basic CRM. |
| `add_note` / `list_notes` | P0 | — / RO | Notes on contact/company/job/event/general. |
| `get_prep_context` | P0 | RO | Job + profile + related notes, so ChatGPT can generate prep. |
| `save_prep` | P0 | — | Save prep as `notes.kind='prep'` on the job. |
| `save_interview_intel` | P0 | — | Save a structured, cited interview report for a company (§28) as `notes.kind='interview_intel'`. |
| `get_interview_intel` | P0 | RO | Saved intel for a company/job (used by prep + mock interview). |
| `set_bridge_mode` | P1 | — | Toggle Bridge mode. |
| `list_contract_leads` | P1 | RO, panel | Contract/freelance matches (HN freelancer threads, contract jobs). |
| `save_event` / `list_events` / `update_event` | P1 | — / RO / — | Events found by ChatGPT web search or pasted URLs. |
| `get_ai_news` | P1 | RO | `{since?, limit?, topics?}` news items for ChatGPT to summarize. |
| `get_brief_data` | P1 | RO, panel | Everything for the daily brief since last seen. |
| `mark_brief_seen` | P1 | — | Advance `brief.last_seen_at`. |
| `calc_rate` / `calc_runway` | P1 | RO | Pure calculators (also in the Money tab). |
| `assess_ai_level` | P1 | — | Score a self-assessment into Level 1–5 (Decisions `choice` + dimension `score`s; heuristic fallback). |
| `get_ladder` | P1 | RO, panel | Current level, history, and the next-level quests. |
| `update_quest` | P1 | — | `{questId, status, evidence?}`. |
| `run_company_dossier` | P1 opt. | openWorld | Agents API research on a company → `notes.kind='dossier'`. Budget-capped. |

Tool descriptions matter for tool selection. Write each like a mini-spec: what it does, when to use
it, when *not* to, and what to do next (e.g. "After calling, offer to save the top job").

### 10.3 Panel (single UI resource, tabbed)

`ui://self-deprecation/panel`. Tabs: **Today** (P1 brief; until then a summary card) · **Jobs** (P0) ·
**People** (P0) · **Prep** (P0) · **Events** (P1) · **News** (P1) · **Money** (P1) · **Profile** (P0) ·
**Level** (P1, §25) · **Settings** (F: reset + load demo data, signed-in identity).

Design: native-feeling, quiet, dense. Follow ChatGPT UI guidelines; honor host light/dark theme; one
accent color; system font stack; no external network calls from the panel (everything through
tools). Every tab has loading, empty, and error states (`web/src/ui/Empty`, `ErrorBanner`).
"Ask ChatGPT" buttons use `bridge.sendPrompt` (e.g. "Prep me for this job", "Draft an intro to Jane").

### 10.4 Plugin skills (`skills/*/SKILL.md`)

| Skill | Tier | What it instructs ChatGPT to do |
|---|---|---|
| `onboarding` | P0 | Ask ~6 questions (titles, seniority, remote, salary/hourly floor, stack, avoid list, Bridge mode?), accept a resume, call `update_criteria`/`save_resume`, then `search_jobs` and open the panel. Offer to set up the daily brief. |
| `interview-prep` | P0 | `get_prep_context` → produce: 5 likely technical Qs, 3 behavioral Qs, 3 questions to ask them, a 30/60/90 talking point, and gaps to study → `save_prep`. |
| `interview-intel` | P0 | Web-search public interview reports for the company + role (§28), synthesize the loop, coding patterns, system-design prompts, behavioral themes, and a study plan with practice links; cite sources; `save_interview_intel`. |
| `mock-interview` | P0 | Run a timed mock interview for a saved job, one question at a time, give feedback; suggest voice mode. Save a summary with `save_prep`. |
| `outreach` | P1 | Draft a short LinkedIn/email intro to a contact using CRM notes; save as `outreach_draft`. |
| `find-events` | P1 | Web-search meetups/hackathons near the user's city for the next 30 days (Meetup, Luma, Eventbrite, community sites), confirm picks, call `save_event`. |
| `weekly-ai-news` | P1 | `get_ai_news({since: 7d})` → "What shipped / Why it matters for your job / Learn this week" (≤ 250 words, links). |
| `level-up` | P1 | Run the AI-Native Ladder self-assessment conversationally, call `assess_ai_level`, explain the result, pick one quest, offer to add it to the weekly news "Learn this week". |
| `daily-brief` | P1 | `get_brief_data` → concise brief → `mark_brief_seen`. If run interactively, offer to schedule it ("every weekday at 7am"). |

Scheduled task setup (P1): the `daily-brief` and `onboarding` skills offer to create a scheduled task
whose prompt invokes `$daily-brief`. **Fallback** for plans where scheduled tasks can't use plugins:
the Today tab has a **Run my brief** button (`bridge.sendPrompt("Run my daily brief")`), and our cron
keeps data fresh regardless.

---

## 11. Job, news, and event sources

All endpoints below are **VERIFY** (P0-A / P1-C spike): confirm URL, response shape, rate limits,
ToS/attribution. Drop anything flaky. Store verified board tokens in `seed/ats-boards.json`.

### 11.1 Jobs (P0-A)

| Source | Endpoint (VERIFY) | Notes |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | Per company. Content is HTML; strip. |
| Lever | `GET https://api.lever.co/v0/postings/{company}?mode=json` | Per company. |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | Per company; may include comp. |
| RemoteOK | `GET https://remoteok.com/api` | First element is a legal notice; attribution/link-back required. |
| Remotive | `GET https://remotive.com/api/remote-jobs?category=software-dev` | Low rate limits; fetch ≤ a few times/day. |
| HN "Who is hiring?" | Algolia: `GET https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring` → latest thread → `GET https://hn.algolia.com/api/v1/items/{id}` | Comments are free text; parse first line `Company \| Role \| Location \| …`. Also the "Freelancer? Seeking freelancer?" thread → contract leads (P1-A). |
| Arbeitnow | `GET https://www.arbeitnow.com/api/job-board-api` | Optional. |
| **Adzuna** (location search) | `GET https://api.adzuna.com/v1/api/jobs/us/search/{page}?app_id=…&app_key=…&what=…&where=…` | Free API key. Makes city/state targeting ("Salt Lake City", "Utah") work for any user without a hand-picked board list. Queried per user criteria in `refresh_jobs` + a daily cron for active users' locations. |
| USAJobs (optional) | `GET https://data.usajobs.gov/api/search?...` | Free key; government roles. |

Seed `seed/ats-boards.json` with 30–50 verified boards in three groups: **Utah tech employers**
(Silicon Slopes), **remote-first companies**, and **AI labs and AI-tooling companies** (for the
OpenAI-hackathon fun factor: OpenAI and peers, if their boards are public on Greenhouse/Lever/Ashby).
Location-specific coverage for every user comes from Adzuna; the board list adds depth and freshness.
The adapter skips boards that 404. Secrets: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.

**CPU/subrequest budget (Workers Free):** 10 ms CPU per invocation and 50 subrequests per request.
Waiting on network calls doesn't count toward CPU time, but JSON parsing and HTML stripping do. Strategy:
- Cron fans out by source *and* by board batch (e.g. 10 boards per invocation, rotating cursor in
  `user_state`-like global key or `fetch_runs`).
- Cap descriptions at 8 KB; strip HTML with a cheap regex pass, not a DOM parser.
- If CPU errors show in `wrangler tail`, upgrade to Workers Paid ($5/mo) and move on.

Crons (≤ 5 on Free): `"0 */4 * * *"` jobs (rotating batches), `"30 6 * * *"` HN threads +
contract leads, `"0 12 * * *"` news. (Times are UTC.)

`refresh_jobs` (demo button) fetches only 2–3 fast boards synchronously with a 6s overall budget,
then returns; everything else comes from the cron-filled catalog or `seed/jobs-snapshot.json`.

### 11.2 News (P1-C)

Candidates (VERIFY each feed URL): OpenAI news, Anthropic news, Google DeepMind blog, Hugging Face
blog, Simon Willison's weblog (Atom), Latent Space, Import AI, Hacker News AI stories (Algolia query
with points threshold), arXiv `cs.AI`/`cs.CL`/`cs.LG` (limit 20/day). Store snippet ≤ 500 chars and
the link only; never store full article text.

### 11.3 Events (P1-B)

Primary: ChatGPT web search via the `find-events` skill, then `save_event`. Meetup's API needs OAuth
and possibly a paid account; Luma has no public discovery API (VERIFY). Both are P2. `save_event`
accepts a pasted URL and may fetch Open Graph tags (http/https only, 6s timeout, 256 KB cap).

---

## 12. Decisions API scoring design

Facts (OpenAI docs): `POST /v1/decisions`, model `gpt-6-luna`; question types `predicate`
(probability), `choice` (one of N), `score` (2–10 ordered levels → probability-weighted index);
1–400 questions per request; `input_json` parts; prompt caching on a shared `input` prefix of
≥ 1,024 tokens; uncached input $0.10/1M tokens; output tokens not charged; answers may be `refusal`.

### 12.1 Pipeline

1. **Candidate selection (code, free):** for the user's latest `criteria_version`, pick jobs not yet
   scored, passing the user's own filters (employment type, remote/hybrid/onsite + location, `avoid` lists,
   salary floor only when the posting lists pay, unless the user turned on "hide unlisted salary",
   posted within 45 days). Rank by keyword/stack overlap; take the top **60**.
2. **Batch requests:** small batches, several calls. Default **20 jobs per request** (40 questions),
   up to **3 requests in flight**, configurable via `DECISIONS_BATCH_SIZE` / `DECISIONS_CONCURRENCY`.
   The API allows up to 400 questions per request, but job descriptions are long. Small batches keep
   each request fast, keep one failure from sinking the whole run (retry or heuristic-fallback just
   that batch), and stay inside Workers' per-request subrequest limits.
   - **Job text sent for scoring is a compact digest, not the full posting:** title, company,
     location/remote, employment type, comp if known, extracted tags, and the first ~1,000 characters
     of the description (≈ 300 tokens). Built by `jobDigest(job)` in `lib/decisions.ts`.
   - `input`: one user message: `input_text` (scoring instructions) + `input_json` (profile: titles,
     seniority, skills, remote, salary, avoid, plus resume summary ≤ 2 KB). This shared prefix is
     identical across the user's requests, so caching applies once it is ≥ 1,024 tokens.
   - `questions`: per job, 2 questions, with the job text in `instructions` as an `input_text` array:
     - `fit_<i>`: `score` with 5 levels: *Poor fit, Weak fit, Plausible fit, Strong fit, Excellent fit*
       (each with a one-line description referencing role, seniority, stack, location, comp).
     - `senior_<i>`: `predicate`: "Is this role at or near the candidate's target seniority?"
   - Use short indexes (`fit_0`, `senior_0`) in names and keep a local index → `jobId` map.
   - Tune batch size in F7's smoke test: start at 20; drop to 10 if latency > 5s or requests error.
3. **Map results:** `fit_score = round(score / 4 * 100)`; store `score_detail` (level
   probabilities, seniority probability, confidence). Refusal or missing answer → heuristic score,
   `score_source='heuristic'`.
4. **Reasons (code, free):** chips from structured overlap: remote match, salary ≥ floor, matched
   skills (top 3), location, contract/full-time. Decisions returns typed answers, not prose, so the
   "why" is ours and is always truthful.
5. **Cache:** `job_matches` row per (user, job) with `criteria_version`. Re-score only when criteria
   change or new jobs arrive.

### 12.2 Guardrails

- Per-user daily cap (`DECISIONS_DAILY_JOB_CAP`, default 300 jobs) enforced via `api_usage`.
- Global kill switch `DECISIONS_ENABLED=0` → heuristic only.
- Timeout 15s per batch; on error, return heuristic scores for that batch immediately and show "Scoring fell back to keyword
  match" in the Jobs tab (rubric: failure handling).

### 12.3 Later uses (P2, same wrapper)

Adjacent-role fit (`choice` over role families), contract-lead quality (`score`), news relevance to
the user (`predicate`), "should I follow up?" (`predicate` over CRM notes).

---

## 13. Error handling and failure modes

| Failure | Behavior | Where shown |
|---|---|---|
| Source fetch fails/times out | `fetch_runs.status='error'`; serve last good data | Jobs tab footer chip "RemoteOK unavailable · showing data from 3h ago" |
| All live sources fail during demo | `search_jobs` falls back to `seed/jobs-snapshot.json` rows (`source='seed'`) | Subtle "snapshot" chip |
| Decisions API error/timeout/refusal | Heuristic score, `score_source='heuristic'` | Banner in Jobs tab |
| No criteria yet | Tool returns `fail('NEEDS_CRITERIA', …, hint: 'Use the onboarding skill')` | ChatGPT starts onboarding; panel shows setup card |
| Invalid tool input | zod error → `INVALID_INPUT` with field messages | ChatGPT corrects and retries |
| Token missing/expired | 401 + `WWW-Authenticate`; tool-level `mcp/www_authenticate` | ChatGPT re-link UI |
| Rate/budget cap hit | `RATE_LIMITED` with reset time | Banner |
| Panel tool call fails | `ErrorBanner` with retry | Panel |

Log with `log.ts` (structured, no PII). Use `wrangler tail` during the demo rehearsal.

---

## 14. Security and privacy

- **Isolation:** user ID only from OAuth props; every user-scoped query filters by `user_id`
  (§8.2); isolation test required in F and for every P0 feature with a user table.
- **Secrets:** Wrangler secrets in prod; `.dev.vars` locally (gitignored). The repo is **public**:
  never commit keys, tokens, real contact data, or the real resume. `seed/demo-todd.json` contains
  only what Todd is happy to show on stage.
- **PII:** never log resume text, note bodies, emails, or tokens. Truncate inputs (resume ≤ 50 KB,
  note ≤ 10 KB).
- **Outbound fetch:** host allowlist for adapters; user-supplied URLs (`save_event`) http/https only,
  timeouts, size caps, no redirects to non-http schemes.
- **Destructive tools:** `reset_my_data` requires `confirm: "RESET"` and `destructiveHint: true`.
- **Panel:** no third-party scripts; all data via tools.
- **Prod bypass guard:** `DEV_AUTH_BYPASS` hard-disabled when `ENVIRONMENT=production`.

---

## 15. Configuration, secrets, environments

**Environments:** `local` (`wrangler dev`, local D1, `DEV_AUTH_BYPASS=1`, MCP Inspector) and
`production` (`*.workers.dev`, connected to ChatGPT). ChatGPT testing always uses the deployed Worker
(HTTPS, no tunnel). Optional: a second Worker `self-deprecation-dev` with its own D1 if prod gets
risky after the demo path is stable.

**wrangler.jsonc (shape; F1 fills in):**
- `name: "self-deprecation"`, `main: "src/index.ts"`, `compatibility_flags: ["nodejs_compat"]`
- `d1_databases: [{ binding: "DB", database_name: "self-deprecation", database_id: "…" }]`
- `kv_namespaces: [{ binding: "OAUTH_KV", id: "…" }]`
- `durable_objects` + `migrations` if using `McpAgent`
- `triggers.crons`: see §11.1
- `vars`: `ENVIRONMENT`, `DECISIONS_ENABLED`, `DECISIONS_DAILY_JOB_CAP`, `DECISIONS_BATCH_SIZE` (20),
  `DECISIONS_CONCURRENCY` (3), `PUBLIC_BASE_URL`

**Secrets:** `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY`, `OPENAI_API_KEY`,
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.
Local copies in `.dev.vars` (with a separate GitHub OAuth app for `http://localhost:8787/callback`).

**npm scripts (F1):** `dev`, `build:web`, `build`, `deploy`, `typecheck`, `test`, `lint`,
`db:generate`, `db:migrate:local`, `db:migrate:prod`, `db:reset:local`, `seed:local`,
`snapshot:feeds`, `smoke:prod` (calls key tools against the deployed Worker).

---

## 16. Human setup checklist (Todd)

Do these while F1 starts; agents can't do them for you.

1. **Hackathon registration.** The 8 p.m. deadline passed; post in the hackathon Slack channel and
   confirm the team is registered for Track 2.
2. **Cloudflare:** `npx wrangler login` in the repo (browser login; no API token needed locally).
   An API token is only needed for CI later (dash → My Profile → API Tokens → "Edit Cloudflare
   Workers" template).
3. **Adzuna API key** (free): https://developer.adzuna.com → app ID + key → Wrangler secrets.
4. **OpenAI API key:** https://platform.openai.com/api-keys, in the project holding the hackathon
   credits. `npx wrangler secret put OPENAI_API_KEY`. Confirm Decisions access in the Playground
   (https://platform.openai.com/decisions).
5. **GitHub OAuth apps** (github.com → Settings → Developer settings → OAuth Apps):
   - *Prod:* homepage `https://self-deprecation.<your-subdomain>.workers.dev`, callback `…/callback`.
   - *Local:* homepage `http://localhost:8787`, callback `http://localhost:8787/callback`.
   Put client ID/secret in Wrangler secrets / `.dev.vars`.
6. **ChatGPT desktop:** Plugins → **+** → *Add custom MCP server* → URL
   `https://self-deprecation.<sub>.workers.dev/mcp` → OAuth → *Create as a plugin*. After metadata
   or UI changes: redeploy → **Refresh** on the connection → new chat.
7. **Demo hygiene:** phone hotspot ready; ChatGPT desktop logged in; a dedicated demo chat; run
   `load_demo_data` before going on stage.
8. **Seed persona:** fill `seed/demo-todd.json` with what you're comfortable showing (headline,
   skills, target titles, 3–4 contacts, a couple of notes, 2 events). Your `todd-fisher-resume` repo
   is a good source; paste only public-safe content.

---

## 17. Work breakdown

Each task lists **Owns** (paths the agent may edit), **Depends on**, **Deliver**, and **Done when**.
Global Definition of Done is in `AGENTS.md`.

### Foundation (F) — serial, one agent, target ≈ 3 hours

**F1 · Scaffold + deploy + platform spike (do first, timebox 60 min)**
- Owns: everything (repo is empty).
- Deliver: TS project, `wrangler.jsonc`, Biome, vitest, `src/index.ts` with a minimal MCP server
  exposing one `ping` tool and the UI resource (hello-world panel), deployed to workers.dev.
- Spike questions to answer in `docs/decisions-log.md`: Does `@openai/mcp-extensions` (server bits)
  work on Workers? `McpAgent` vs stateless transport? Does the hello panel render in ChatGPT via
  thread entrypoint? Does the Cloudflare GitHub-OAuth template meet §9 requirements?
- Done when: Todd adds the deployed URL in ChatGPT, `@Self-Deprecation ping` works, and the
  hello panel opens beside the chat. **If the SDK fails on Workers → stop and trigger R1 fallback.**

**F2 · OAuth + identity**
- Deliver: workers-oauth-provider wrapping `/mcp`; GitHub handler; optional `ALLOWED_GITHUB_LOGINS`
  allowlist (D2; friendly "this is a private beta" page otherwise); `findOrCreateUserByIdentity`;
  props → `ctx.userId`; `.well-known` endpoints verified; `needsAuth()`; `DEV_AUTH_BYPASS` with prod
  guard; `get_profile` with `openai/profile` meta.
- Done when: in ChatGPT, first tool call triggers GitHub login and `get_profile` returns Todd's
  GitHub identity; MCP Inspector local call works with bypass.

**F3 · Database**
- Deliver: Drizzle schema for **all** tables in §7, initial migration, `db/client.ts`, local + prod
  migrations applied, `scripts/db-reset`.
- Done when: `db:migrate:local` and `db:migrate:prod` succeed; isolation test helper exists.

**F4 · Registry + contracts**
- Deliver: `mcp/types.ts`, `mcp/result.ts`, `mcp/registry.ts` with stub `FeatureModule` for every
  folder in §6, `server.ts` auto-registering tools (zod → JSON schema, securitySchemes,
  annotations, panel meta), `docs/TOOLS.md` skeleton, `lib/http.ts`, `lib/log.ts`, `lib/errors.ts`,
  `lib/skills-dict.ts`.
- Done when: adding a tool to any feature's `tools` array makes it appear in ChatGPT after refresh,
  with no edits outside that feature.

**F5 · Panel shell**
- Deliver: Vite single-file build embedded in the UI resource; `bridge.ts`; `tabs.ts` with all tabs
  pre-declared (P0 enabled, P1 disabled); shared `ui/` components; theme tokens (light/dark);
  `web/src/copy.ts` seeded from §24 (status chip, version label, loaders, hope-line footer);
  Settings tab (identity, Reset, Load demo data).
- Done when: panel opens from `open_dashboard`, shows the signed-in name, and Reset/Load demo data
  work from buttons.

**F6 · Core tools**
- Deliver: `features/core`: `get_profile`, `open_dashboard`, `reset_my_data`, `load_demo_data`
  (+ `seed/demo-todd.json` placeholder), tests incl. reset isolation.
- Done when: reset wipes only the caller's data (test), demo load is idempotent.

**F7 · Decisions wrapper**
- Deliver: `lib/decisions.ts` per §8.5/§12 with a live smoke script (`scripts/smoke-decisions.ts`)
  and `heuristicFit`.
- Done when: smoke scores 5 seed jobs against the seed profile with plausible ordering; fallback
  test passes with the API mocked to fail.

**F8 · Cron + sources skeleton**
- Deliver: `scheduled()` → `cron/dispatcher.ts`; `sources/types.ts`, `sources/registry.ts` (stubs);
  `fetch_runs` recording; one trivial adapter (e.g. a single Greenhouse board) end to end into `jobs`.
- Done when: `wrangler dev --test-scheduled` run inserts jobs and a `fetch_runs` row.

**F9 · Gate review (Todd + lead agent, 15 min)**
- In ChatGPT: login → `open_dashboard` → Settings shows identity → Load demo data → Reset.
- Freeze `src/db/schema.ts`, `src/mcp/*`, `web/src/bridge.ts`, `web/src/tabs.ts`, `sources/types.ts`.
- Tag `foundation-v1`. Fan out.

### P0 — demo-critical, parallel (5 lanes)

**P0-A · Job sources**
- Owns: `src/sources/adapters/*`, `features/jobs/{repo,service,catalog-tools}.ts` (catalog side;
  `refresh_jobs` lives in `catalog-tools.ts`), `seed/ats-boards.json`, `seed/jobs-snapshot.json`,
  `scripts/snapshot-feeds.ts`. (F4 pre-creates `features/jobs/index.ts` importing both
  `tools.ts` and `catalog-tools.ts`, so P0-A and P0-C never edit the same file.)
- Depends on: F8.
- Deliver: adapters for Greenhouse, Lever, Ashby, RemoteOK, Remotive (+ HN in P1-A); normalization,
  HTML stripping, tag extraction, upsert by `(source, source_job_id)`, rotating batch cron,
  Adzuna location search driven by the user's criteria, `refresh_jobs` (bounded), snapshot script
  capturing ~60 relevant jobs (incl. Utah + AI-lab roles) for fallback.
- Done when: catalog has ≥ 300 jobs from ≥ 3 sources; a forced adapter failure shows in
  `fetch_runs` and doesn't break others; unit tests per adapter using recorded fixtures.

**P0-B · Criteria, resume, onboarding**
- Owns: `features/criteria/*`, `skills/onboarding/`.
- Depends on: F.
- Deliver: `get_criteria`, `update_criteria`, `save_resume`; Profile tab (form with chips for
  titles/skills, remote/salary/hourly, Bridge mode toggle, resume status); onboarding skill.
- Done when: in ChatGPT, "help me set up my job search" runs onboarding and the Profile tab reflects
  answers; pasting a resume populates skills.

**P0-C · Scoring + Jobs tab**
- Owns: `features/scoring/*`, `features/jobs/{tools,panel}.tsx|ts` (user side: `search_jobs`,
  `get_job`, `update_job_status`, `score_jobs`).
- Depends on: F7, P0-A (can start on `seed/jobs-snapshot.json`), P0-B contract (profile shape is
  frozen in F3).
- Deliver: candidate selection, batch scoring, reasons chips, caching by `criteria_version`, Jobs tab
  (ranked cards: fit badge, chips, company/title/location/comp, Save/Dismiss, "Prep me" →
  `sendPrompt`), filters, fallback banner, source-health footer.
- Done when: with demo profile, `search_jobs` returns ≥ 10 ranked jobs in < 8s cold, < 1s cached;
  Decisions-down test shows heuristic banner.

**P0-D · CRM (basic)**
- Owns: `features/crm/*`.
- Deliver: contacts + notes tools, People tab (list, search, contact detail with notes timeline, add
  contact/note forms, follow-up date), tool descriptions that make "I met Jane from Stripe at…"
  map to `add_contact` + `add_note`.
- Done when: natural-language add works in ChatGPT and appears live in the panel; isolation test.

**P0-E · Interview prep, company interview intel, mock interview**
- Owns: `features/prep/*`, `skills/interview-prep/`, `skills/interview-intel/`, `skills/mock-interview/`.
- Deliver: `get_prep_context`, `save_prep`, `save_interview_intel`, `get_interview_intel`; Prep tab
  (saved jobs with prep status; per-company "Interview loop" card: stages, coding patterns with
  practice links, system-design prompts, behavioral themes, sources, confidence); all three skills.
  Mock interview pulls the company's intel so practice matches the real loop.
- Done when: "What's the interview like at <company>?" produces cited intel visible in the Prep tab;
  "Prep me for <saved job>" builds on it; mock interview runs (try it in voice mode once).

**P0-F · Packaging, skills wiring, demo**
- Owns: `plugin/`, `docs/DEMO.md`, `seed/demo-todd.json` (content with Todd), tool descriptions
  review across features (comment-only PRs to other owners).
- Deliver: plugin package with skills + MCP connection (use `$plugin-creator` in Codex or
  `@plugin-creator` in ChatGPT Work) and a local marketplace entry; plugin name, description,
  starter prompts; tool-selection eval set (direct, indirect, negative prompts) in `docs/DEMO.md`;
  the demo script with exact prompts; `scripts/smoke-prod.ts`; the public landing page + QR code (§30).
- Done when: a fresh ChatGPT chat with the installed plugin completes the full demo script twice in
  a row.

### P1 — if time, parallel (each hidden until ready via `TabDef.enabled`)

- **P1-A Bridge mode + contract leads** · Owns `features/contracts/*`, HN adapters.
  `set_bridge_mode`, `list_contract_leads`, HN "Who is hiring" + "Seeking freelancer" parsing,
  contract chip in Jobs tab, "Bridge" filter. Done when Bridge mode surfaces ≥ 10 contract leads.
- **P1-B Events** · Owns `features/events/*`, `skills/find-events/`. Events tab (upcoming, status),
  `save_event` with OG fetch. Done when "find AI meetups in Salt Lake this month" saves events
  that show in the tab.
- **P1-C AI news** · Owns `features/news/*`, news adapters, `skills/weekly-ai-news/`. News tab (list
  with source + age), `get_ai_news`. Done when the skill produces a ≤ 250-word digest with links.
- **P1-D Daily brief + scheduling** · Owns `features/brief/*`, `skills/daily-brief/`. Today tab
  (new top matches, contract leads, upcoming events, follow-ups due, 5 headlines, **Run my brief**),
  `get_brief_data`, `mark_brief_seen`, scheduled-task setup flow. Done when a scheduled task runs the
  brief (or the fallback button does on plans that can't).
- **P1-E Calculators** · Owns `features/calculators/*`. Money tab: salary → hourly/day rate
  (tax/benefits/billable-hours assumptions shown), runway months. Pure functions + tests.
- **P1-F Native settings + extended forms** · Owns `features/criteria/native-*` (coordinate with
  P0-B owner). Map criteria to structured plugin settings; onboarding via extended forms. Fallback:
  existing Profile tab + chat onboarding.
- **P1-H AI-Native Ladder** · Owns `features/ladder/*`, `skills/level-up/`. See §25. Level tab
  (current level badge, progress to next level, dimension radar/bars, quest checklist, history),
  `assess_ai_level` (Decisions), `get_ladder`, `update_quest`, static quest catalog. Done when a
  self-assessment produces a level with dimension scores and three next-level quests, and
  completing a quest updates progress. *Strong demo candidate; prioritize right after P1-D.*
- **P1-G (optional) Agents API company dossier** · Owns `features/dossier/*`. `run_company_dossier`
  → Agents API session with web search → structured dossier (what they do, recent news, eng
  stack/culture signals, who to reach out to as role types, not scraped people) → `notes.kind='dossier'`.
  Budget: ≤ 3 runs/user/day. Done when a dossier appears on a company's notes.

### P2 — roadmap slide (do not build during the hackathon unless everything else is done)

Skill-shift radar (posting tag trends vs. resume) · adjacent-role fit (Decisions `choice`) ·
contract pipeline + proposals/SOWs · portfolio case studies · composer @-mentions · resume file
viewer · Google login + account linking · Meetup/Luma integrations · Indie mode · outreach
sequences · email digests · public launch (OpenAI plugin submission + review).

---

## 18. Parallel execution and ownership map

- One branch per task: `task/<ID>-<slug>`; use git worktrees for parallel agents
  (`git worktree add ../sd-P0-C task/P0-C-scoring`).
- Small PRs into `main`; the integrator (Todd or a lead agent) merges in this order when conflicts are
  possible: P0-A → P0-B → P0-C → P0-D → P0-E → P0-F.
- **Frozen after F9:** `src/db/schema.ts`, `migrations/`, `src/mcp/*`, `src/sources/types.ts`,
  `src/sources/registry.ts`, `web/src/bridge.ts`, `web/src/tabs.ts`, `web/src/ui/*` (additive
  components allowed in a feature folder instead).
- Contract change process: append to `docs/decisions-log.md` (what, why, who's affected), integrator
  applies it on `main`, owners rebase.

| Path | Owner task |
|---|---|
| `src/sources/adapters/{greenhouse,lever,ashby,remoteok,remotive}.ts`, `features/jobs/repo.ts` (catalog) | P0-A |
| `features/criteria/*`, `skills/onboarding` | P0-B (P1-F may add `native-*` files) |
| `features/scoring/*`, `features/jobs/{tools.ts,panel.tsx}` | P0-C |
| `features/crm/*` | P0-D |
| `features/prep/*`, `skills/{interview-prep,interview-intel,mock-interview}` | P0-E |
| `plugin/*`, `docs/DEMO.md`, `seed/demo-todd.json`, `scripts/smoke-prod.ts` | P0-F |
| `features/contracts/*`, `src/sources/adapters/hn_*.ts` | P1-A |
| `features/events/*`, `skills/find-events` | P1-B |
| `features/news/*`, `src/sources/adapters/news_*.ts`, `skills/weekly-ai-news` | P1-C |
| `features/brief/*`, `skills/daily-brief` | P1-D |
| `features/calculators/*` | P1-E |
| `features/ladder/*`, `skills/level-up` | P1-H |
| `features/dossier/*` | P1-G |

Model-agnostic: any agent (Codex, Claude Code, others) can take any task. Give each agent:
"Read `AGENTS.md` and `docs/PLAN.md`. You own task **<ID>**. Work only in the paths listed for it."

---

## 19. Timeline (MT)

| When | What |
|---|---|
| Fri 23:30 – 00:30 | Todd: §16 setup. Agent: **F1 spike** (deploy + ChatGPT hello panel). Decision point at 00:30. |
| Fri 00:30 – 03:00 | F2–F8 (one agent, sequential; Todd reviews F2 login in ChatGPT). |
| Fri 03:00 | **F9 gate**, tag `foundation-v1`. Sleep. |
| Sat 07:00 – 10:30 | P0-A…E in parallel (5 agents). P0-F starts seed + DEMO.md. |
| Sat 10:30 – 11:15 | Integrate P0, deploy, **dry run #1** of the demo. |
| Sat 11:15 – 13:30 | P1 lanes in parallel (prioritize P1-D brief, P1-H ladder, P1-C news, P1-B events, P1-A bridge). Fix P0 bugs first. |
| Sat 13:30 | Feature freeze. Only bug fixes, copy, tool descriptions. |
| Sat 13:45 – 14:30 | Dry runs #2 and #3 from a fresh chat; record a backup screen video. |
| Sat 14:45 | Final deploy, `smoke:prod`, `load_demo_data`. |
| Sat 15:00 | Code freeze. Judging. |

---

## 20. Demo script (3 minutes)

**0:00–0:30 · User and problem.** "I'm Todd, a senior software engineer. AI is coming for our jobs,
so I built an AI to help me find a new one. *(beat)* Fewer roles, more contract work, and the skills
employers want change monthly. Self-Deprecation is a career copilot that lives inside ChatGPT:
every deprecation notice deserves a migration guide."

**0:30–2:30 · Live.** (Panel open beside the chat via the conversation panel.)
1. "I want senior or staff backend/AI engineering roles, remote, $180k+, and I'm open to contract work
   while I look." → onboarding fills criteria → **Profile tab updates**.
2. "Find my best matches." → `search_jobs` → **Jobs tab**: ranked list with fit 0–100 and why chips.
   Say: "The Decisions API scores every job against my profile; it costs fractions of a cent."
3. Save the top job → "What's their interview process like?" → ChatGPT researches public reports →
   **Prep tab** shows the loop, likely coding patterns, and a system-design prompt with sources. Click
   **Prep me** for a study plan. (Fun option: run it on an OpenAI role.)
4. "I met Jane Doe at this hackathon; she's a staff engineer at <company> and offered an intro." →
   contact + note → **People tab**.
5. (If P1-H is ready) "Where am I as an AI-native engineer?" → `level-up` skill → **Level tab**:
   "Level 3 · Agent Driver → next: Parallel Orchestrator", with three quests. (Plug: "This app was
   built by a swarm of agents; I'm working on my Level 5.")
6. (If P1 is ready) **Today tab** → brief with new matches, contract leads, a local meetup, and AI
   news → "Run this every weekday at 7am" → scheduled task created.

**2:30–3:00 · Tech + limitations.** "Built as a ChatGPT plugin with extensions (sidebar app +
conversation panel), plugin skills and scheduled tasks; the Decisions API for scoring; Cloudflare
Workers + D1 with GitHub sign-in so each user's data is separate. Limits today: public ATS and
remote-board feeds only (no LinkedIn), scores are probabilistic, one login provider. Next: skill-shift
radar, adjacent roles, Indie mode. We're not being deprecated. We're being migrated."

**Closing invite (last 10 seconds, §30):** QR code on screen → "It's live. Scan this, sign in with
GitHub, and see where you are on the ladder. Go ahead, find out if you're deprecated."

**Before stage:** `load_demo_data`, open a fresh chat, keep `wrangler tail` running on the laptop,
hotspot ready, backup video queued.

---

## 21. Risks and fallbacks

| # | Risk | Likelihood | Mitigation / fallback |
|---|---|---|---|
| R1 | OpenAI extensions SDK or MCP UI doesn't work on Workers | Med | F1 spike in first hour. Fallback: Node server (Hono) on Railway/Fly + Turso (libSQL; Drizzle supports it). Same code layout; swap `db/client.ts` and entry file. |
| R2 | workers-oauth-provider doesn't satisfy ChatGPT's OAuth requirements | Med | Fix in F2 (PRM, `resource`, S256). If blocked > 90 min: ship the demo with a *demo-only* single-user mode (auth `noauth`, fixed user, env-flagged) and keep OAuth on a branch; mention as limitation. |
| R3 | Workers Free CPU (10 ms) / subrequest (50) limits | Med | Batch adapters; if errors persist, upgrade to Workers Paid ($5/mo). |
| R4 | Account can't add custom MCP servers / plugin extensions | Low–Med | Verify in F1. Try ChatGPT Work/desktop settings; ask organizers for help at the venue. |
| R5 | Feed endpoints changed or rate-limited | Med | Verified board list; `seed/jobs-snapshot.json` fallback. |
| R6 | Decisions key/credits/access issue | Low | Heuristic scoring path; `DECISIONS_ENABLED=0`. |
| R7 | Scheduled tasks can't call plugin on Pro | Med | "Run my brief" button; demo shows the button if needed. |
| R8 | Venue Wi-Fi | Med | Server is in the cloud; hotspot for the laptop; backup video. |
| R9 | Merge conflicts across agents | Med | Frozen contracts, pre-declared registries, ownership map, small PRs. |
| R10 | Running out of time | High | P0 only depends on F; P1 tabs hidden until ready; freeze at 13:30. |

---

## 22. Open questions / VERIFY list

1. `@openai/mcp-extensions` package names, server API for entrypoints, and the panel-side API
   (`callTool`, send prompt, theme, initial tool output). Source: github.com/openai/mcp-extensions.
2. Whether one UI resource can serve both `global` and `thread` entrypoints and how the panel learns
   which tab to open (tool input vs. initial output).
3. Cloudflare remote-MCP GitHub-OAuth template: current name, transport (`McpAgent`/DO vs.
   stateless), PRM + `resource` support, DCR/CIMD, S256.
4. ChatGPT custom MCP server connection: OAuth configuration choices on the "Add custom MCP server"
   screen; exact redirect URI to allowlist.
5. Plugin packaging: `plugin_asdk_app` ID and local marketplace flow via plugin-creator.
6. Job/news feed endpoints and ToS (§11).
7. Scheduled tasks on Pro using plugin tools (docs mention ChatGPT Work/Codex-created tasks).
8. Extended forms require MRTR for OpenAI-registered servers. Does that apply to custom servers?

Record answers in `docs/decisions-log.md` as you resolve them.

---

## 23. Appendices

### A. Decisions request sketch (TypeScript)

```ts
import OpenAI from "openai";

const LEVELS = [
  { label: "Poor fit",      description: "Wrong role family or seniority, or violates hard preferences." },
  { label: "Weak fit",      description: "Same field but major mismatches in seniority, stack, or location." },
  { label: "Plausible fit", description: "Reasonable match with notable gaps." },
  { label: "Strong fit",    description: "Matches role, seniority, and most of the stack and preferences." },
  { label: "Excellent fit", description: "Near-ideal on role, seniority, stack, location, and compensation." },
];

// Called once per batch of ~20 job digests (see §12.1), never with the full catalog.
export async function scoreBatch(apiKey: string, profile: object, jobs: { id: string; text: string }[]) {
  const client = new OpenAI({ apiKey });
  const decision = await client.decisions.create({
    model: "gpt-6-luna",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "You evaluate job postings for one candidate. The candidate profile follows as JSON." },
        { type: "input_json", data: profile },
      ],
    }],
    questions: jobs.flatMap((job, i) => [
      { type: "score", name: `fit_${i}`, levels: LEVELS,
        instructions: [{ type: "input_text", text: `How well does this job fit the candidate?\n\n${job.text}` }] },
      { type: "predicate", name: `senior_${i}`,
        instructions: [{ type: "input_text", text: `Is this job at or near the candidate's target seniority?\n\n${job.text}` }] },
    ]),
  });
  // Map answers by name; answer.type is 'score' | 'predicate' | 'refusal'.
  return decision.answers;
}
```

(VERIFY that `instructions` accepts the content-part array for `score` questions as documented, and
that the SDK version installed exposes `client.decisions`.)

### B. Skill draft (onboarding)

```markdown
---
name: onboarding
description: Set up or update the user's job search in Self-Deprecation: target roles, seniority, remote preference, salary or hourly floor, stack, things to avoid, Bridge mode, and resume. Use when the user starts a job search, says their criteria changed, or a Self-Deprecation tool returns NEEDS_CRITERIA.
---

# Self-Deprecation onboarding

Open with: "Every deprecation notice comes with a migration guide. Let's write yours." (One quip max.
If the user mentions a layoff, rejection, or money stress, skip the humor and be warm and practical.)

1. Call `get_criteria`. If criteria exist, summarize them and ask what changed.
2. Ask at most six short questions, one or two at a time: target titles; seniority; remote/hybrid/onsite
   and which city/state (suggest the user's approximate city if ChatGPT shared one); minimum salary (and hourly rate if open to contract); core stack; companies or
   industries to avoid. Ask whether to turn on Bridge mode (contract work while searching).
3. If the user shares a resume, read it, extract skills, titles, and seniority, and call `save_resume`
   with the text and the extraction.
4. Call `update_criteria` with everything gathered.
5. Call `search_jobs` with `limit: 10` and briefly present the top three with one line each.
6. Offer next steps: open the dashboard, prep for a top job, or set up a weekday daily brief.
Keep messages short. Never invent salary or experience the user didn't give.
```

### C. Seed persona (`seed/demo-todd.json`) shape

```json
{
  "profile": {
    "headline": "Senior software engineer: backend, platform, and applied AI",
    "target_titles": ["Senior Software Engineer", "Staff Software Engineer", "AI Engineer"],
    "seniority": "senior",
    "locations": ["Salt Lake City, UT", "Remote (US)"],
    "remote_pref": "remote",
    "salary_min": 180000,
    "hourly_min": 110,
    "employment_types": ["full_time", "contract"],
    "skills": ["typescript", "node", "react", "python", "postgres", "aws", "llm apps"],
    "avoid": { "companies": [], "industries": ["gambling"], "keywords": ["clearance required"] },
    "bridge_mode": true
  },
  "contacts": [
    { "name": "…", "company": "…", "title": "…", "where_met": "Codex DevDay Hackathon, Lehi", "notes": ["…"] }
  ],
  "events": [ { "title": "…", "url": "…", "starts_at": "2026-11-…", "city": "Salt Lake City" } ],
  "saved_job_urls": []
}
```

Replace placeholders with real, public-safe details before the demo. Numbers above are examples, not
assumptions about Todd's actual targets.

---

## 24. Voice and humor guide ("laugh, then wince, then hope")

The product has a personality: **gallows humor about being deprecated, followed by real
optimism**. The joke lands, you laugh, then it sinks in ("…oh. That's actually us."), and then the
product hands you the migration guide. Dark irony first, hope second, every time.

### 24.1 The motif: you are a deprecated API

Software engineers already speak the language of their own replacement. Use it everywhere:

| Engineering term | How we use it |
|---|---|
| `@deprecated` | You. "Deprecated since 2026. Still supported." |
| Deprecation notice → **migration guide** | The whole product. We never stop at the notice. |
| Semver: `you@1.x` → `you@2.0` | Career growth. "Shipping you@2.0: now with AI-native skills." |
| Breaking changes | Job market shifts (skill-shift radar, news). |
| Changelog / release notes | The daily brief and AI news. |
| Backward compatibility | Bridge mode (contract income while you migrate). |
| Fork | Indie mode ("Fork yourself."). |
| Sunset date / EOL | Runway calculator, used gently (see 24.4). |
| Garbage collection, `rm -rf`, null pointer, 404, 503 | Empty states, errors, reset. |

### 24.2 The formula

Every humorous line follows **joke → turn → hope** (the turn can be implicit):

- "No matches yet. Even the robots are taking a while to replace you." → *[Set up my search]*
- "Your network is a null pointer. Let's initialize it." → *[Add someone you met]*
- "This source returned 503. Relatable." → "Showing results from 3 hours ago."
- "The AI that scores your jobs is down. Ironic. Using keyword match for now."
- "Every deprecation notice ships with a migration guide. This is yours." (onboarding intro)
- "Bridge mode: backward-compatible income while you ship you@2.0."
- "We're not being deprecated. We're being migrated." (demo closing line)

### 24.3 Copy bank (starting set; agents may extend in their feature folder)

**App chrome**
- Header status chip: `Status: Deprecated (still supported)`
- Version label under the user's name: `you@1.9.4 → migrating to you@2.0`
- Footer, rotating hope lines:
  - "Engineers who learn AI-native tools aren't being replaced. They're doing the replacing."
  - "The job is changing faster than ever. So can you."
  - "Your experience isn't legacy code. It's the training data."
  - "Ship small. Learn daily. Compound."

**Loading messages** (rotate)
- "Refactoring your career…"
- "Running migrations on your résumé…"
- "Checking whether you've been replaced yet… not yet."
- "Garbage-collecting outdated skills…"
- "Asking the robots nicely…"
- "Compiling you@2.0…"

**Tab subtitles** (labels stay plain for usability; the subtitle carries the joke)
- Today: "Release notes for your career"
- Jobs: "Open positions humans can still apply for"
- People: "Your network: the one thing AI can't fake (yet)"
- Prep: "Unit tests for your interview"
- Events: "In-person networking: still not automated"
- News: "The changelog of the industry deprecating you. Read it, then use it."
- Money: "Runway, rates, and other existential math"
- Profile: "Your API spec"
- Settings: "Danger zone (career-safe)"

**Empty states**
- Jobs: "No matches yet. Even the robots are taking a while to replace you." CTA: *Set up my search*
- People: "Your network is a null pointer." CTA: *Add someone you met*
- Prep: "Zero test coverage on your next interview." CTA: *Prep for a saved job*
- Events: "No events saved. Touch grass, and maybe a badge lanyard." CTA: *Find meetups near me*
- News: "Nothing new in AI in the last hour. A historic first." CTA: *Refresh*

**Errors / fallbacks**
- Source down: "{source} returned {status}. Relatable. Showing data from {age} ago."
- Decisions down: "The AI that rates your jobs is out. Ironic. Using keyword match until it's back."
- Not found: "404: job not found. Very 2026."
- Rate limit: "You've scored {n} jobs today. Even AI needs a break. Resets {time}."

**Confirmations**
- Reset: "This will `rm -rf` your data in Self-Deprecation. Your career survives. Type RESET."
- After reset: "Clean install complete. Fresh start, same great engineer."
- Load demo data: "Loading a fully employed-looking version of you."
- Job saved: "Saved. Future you says thanks."
- Contact added: "Network += 1."

**Skills (ChatGPT's voice)**
- Onboarding opener: "Every deprecation notice comes with a migration guide. Let's write yours.
  Six quick questions."
- Daily brief title: "Standup with the future, {date}"; sign-off rotates hope lines.
- Weekly AI news title: "This week's breaking changes", closing with "Learn this week: {one thing}".
- Mock interview opener: "Interviewers haven't been replaced by AI yet. Let's practice on one that has."

### 24.4 Rules (where humor stops)

1. **Humor lives in the chrome**: headers, subtitles, loaders, empty states, confirmations, skill
   intros/outros. **Never in data**: scores, salaries, job details, the user's own notes.
2. **Joke first, hope last.** A screen or message never ends on the dark line.
3. **Punch at the situation, never at the user.** No "you're obsolete." The industry is weird; the
   user is the hero migrating through it.
4. **Read the room.** If the user shares a rejection, a layoff, money stress, or anything personal,
   skills drop the jokes and respond with warmth and practical next steps. The Money tab's runway
   result is stated plainly first ("7 months of runway"), with an optional gentle line after
   ("That's a lot of sprints.").
5. **One quip per response, max** in skills. Then substance.
6. **Clarity beats cleverness.** Buttons and labels stay literal ("Save job", "Reset my data").
7. **Don't overuse it.** If every element jokes, none land. Roughly one humorous element per screen.

### 24.5 Where it lives in code

- `web/src/copy.ts` (F5): app-chrome strings, loaders, hope lines, and a `pick()` rotator.
  Frozen after F9 like other shared files; features keep their own strings in
  `features/<f>/copy.ts`.
- Skills include their voice lines directly in `SKILL.md`, plus rule 24.4 #4 verbatim.
- Demo (§20): open with "AI is coming for our jobs, so I built an AI to help me find a new one,"
  close with "We're not being deprecated. We're being migrated."

---

## 25. The AI-Native Ladder (career level feature)

**Idea:** besides finding the next job, help engineers become the engineer the next job wants. Show
where you are on the journey from hand-written code to fully AI-native engineering (orchestrating
parallel agents and building self-running loops), and give concrete quests to reach the next level.
It turns the dark joke ("you're deprecated") into the hopeful answer ("here's your migration path").

**Inspiration and attribution:** inspired by Boris Cherny's (Anthropic, Claude Code) public comments
that the engineer's job is shifting from writing code to orchestrating agents, e.g. running several
agents in parallel. **VERIFY:** Todd recalls a specific "five levels" framing from Boris. If you
find the source, align level names/wording and cite it in the app's About text. Until then, the
ladder below is our own and is presented as "inspired by," not quoted.

### 25.1 The five levels (semver-flavored, per §24 voice)

| Level | Name | You… | Deprecation joke (chrome only) |
|---|---|---|---|
| 1 | **Artisan** (hand-coder) | Write nearly all code by hand; maybe autocomplete. | "Handcrafted, small-batch, artisanal code. Very 2019." |
| 2 | **Pair Programmer** | Chat with AI for snippets and explanations, then paste. | "You and the robot, copy-pasting in harmony." |
| 3 | **Agent Driver** | Delegate whole tasks to one coding agent in the repo; review diffs; keep `AGENTS.md`/context files. | "You've stopped typing. Your keyboard is worried." |
| 4 | **Parallel Orchestrator** | Run several agents at once (worktrees), write specs/plans first, verify with tests and CI, merge in order. | "You manage a team that never sleeps or expenses lunch." |
| 5 | **Loop Builder** | Build systems that build: scheduled/background agents, self-verifying loops, evals, agent swarms, custom tools/MCP servers, skills. | "You automated yourself. Promoted to the one who automates." |

Hope line under every level: *"Every level up makes you harder to replace, not easier."*

### 25.2 Dimensions (each scored 0–4)

1. **Tooling:** which AI tools you use daily (autocomplete → chat → coding agents → custom tools/MCP).
2. **Delegation:** size of work you hand off (lines → functions → features → projects).
3. **Verification:** how you trust output (eyeballing → tests → CI gates → evals).
4. **Parallelism:** concurrent agents/workstreams you run (0 → 1 → 2–5 → swarm).
5. **Automation:** work that happens without you (none → scripts → scheduled agents → self-improving loops).

### 25.3 Assessment flow

- `level-up` skill asks ~8 quick questions (multiple choice where possible, one optional
  "describe your workflow" free text ≤ 2 KB).
- `assess_ai_level` sends the answers to the **Decisions API** in one request: a `choice` question
  over the five levels (with level descriptions) plus five `score` questions (one per dimension, 5
  levels each). Cheap (one small request), visibly an OpenAI-powered judgment, and it returns
  probabilities we can show ("62% Level 3, 30% Level 4").
- Heuristic fallback: map multiple-choice answers to dimension points; level = rounded average.
- Store in `ladder_assessments`; show history so progress over time is visible.

### 25.4 Quests (static catalog: `features/ladder/quests.ts`)

Concrete, finishable in an evening, each tied to a level and dimension. Examples:
- L1→2: "Use an AI chat to explain an unfamiliar file in your codebase, then verify one claim by reading the code."
- L2→3: "Hand one whole bug fix to a coding agent (Codex or Claude Code); review the diff instead of writing it."
- L2→3: "Write an `AGENTS.md` for one repo and watch agent output improve."
- L3→4: "Run two agents in parallel on separate worktrees with a written spec; merge both."
- L3→4: "Make tests the agent's definition of done; reject any diff that doesn't pass."
- L4→5: "Create a scheduled agent task that runs every weekday and reports findings."
- L4→5: "Build a tiny MCP server or skill that gives your agent a new capability."
- L4→5: "Write an eval for one agent workflow and track it for a week."

Quests can be marked done with optional evidence (a link or note). The daily brief and weekly AI
news can suggest a quest that matches what's trending ("Everyone's shipping MCP servers this week.
Quest: build one.").

### 25.5 Panel: Level tab

Current level badge (`you@L3 · Agent Driver`), progress bar to next level (dimension gaps), five
dimension bars, quest checklist for the next level, assessment history sparkline, "Reassess" and
"Ask ChatGPT for a plan" (`sendPrompt`) buttons. Subtitle: "Your migration path from legacy to
AI-native."

### 25.7 More self-assessment lenses (beyond the ladder)

The ladder is the headline; these add depth (P1 if cheap, otherwise P2). Each reuses
`ladder_assessments` with a `lens` key in `answers`/`dimension_scores` (no schema change).

- **AI Toolbelt inventory:** which tools you actually use, by category (autocomplete, chat, coding
  agents, agent orchestration, MCP/custom tools, evals/observability, voice). Shows gaps vs. what
  your target job postings mention.
- **Agentic habits checklist:** weekly yes/no habits (wrote a spec before delegating; ran 2+ agents
  in parallel; added tests as the agent's done-condition; reviewed diffs, not keystrokes; automated
  one recurring chore). Streaks for the Today tab.
- **General AI fluency (beyond code):** research, writing, meetings, planning, learning. For
  engineers moving toward the "builder" generalist that crosses product, design, and engineering.
- **Market-pull lens:** from saved job matches, how often target roles demand L4+ skills ("72% of
  your top matches mention agents or evals").
- **Monthly re-assessment** with a trend line: the "you@vX" changelog.

### 25.6 Later (P2)

Infer level signals from the user's job matches (which postings demand L4+ skills), connect to the
skill-shift radar, team/leaderboard mode, shareable badge ("you@L4"), and an Indie-mode tie-in
("Level 5 engineers make excellent one-person companies").

---

## 26. Planning protocol and decisions that need Todd

### 26.1 Sub-plans are delegated, with a lightweight gate

Feature-level design is delegated to the agent that owns the task. Before writing code, each agent
writes a one-page **task brief** at `docs/tasks/<ID>.md` (use plan mode if the tool has one):

1. Approach in 3–6 bullets.
2. Files it will create/edit (must be inside its Owns paths).
3. Tool names with zod input and `structured` output shapes; panel states (loading/empty/error).
4. Test list (incl. isolation test if user data is touched).
5. **Open questions**, each tagged `[contract]`, `[product]`, or `[local]`.

Then:
- Only `[local]` questions → proceed immediately (the agent decides and notes it in the brief).
- Any `[contract]` question → append to `docs/decisions-log.md`, ping the integrator, keep working
  on everything not blocked by it.
- Any `[product]` question → ask Todd in one message with a recommended default; if no answer in
  15 minutes, take the default and note it.

Commit the brief as the task's first commit (`docs(<ID>): task brief`). Briefs double as the
"what we built" record for judges and for post-hackathon work. Subagents are fine for research
(e.g. verifying feed endpoints) and for tests; one agent stays accountable for the task.

### 26.2 Decisions that need Todd (product/architecture)

Settle these yourself; everything else is delegated.

| # | Decision | When | Recommended default |
|---|---|---|---|
| D1 | **Decided:** Cloudflare Workers is not a Node server; it's its own JavaScript runtime with partial Node compatibility. If the MCP/extensions libraries fail on it in the F1 spike, the agent switches to the Node fallback (R1) on its own and logs why. | F1 | Stay on Workers. |
| D2 | **Decided:** open signup for anyone with GitHub. Cost is protected by per-user daily Decisions caps (`DECISIONS_DAILY_JOB_CAP`) and the global kill switch. | — | Open signup. |
| D3 | **Decided:** location is user-driven (onboarding asks remote/hybrid/onsite + city/state). Sources must cover location search (Adzuna, §11.1) plus an ATS board list seeded with Utah tech employers, remote-first companies, and AI labs (OpenAI etc., if their boards are public). | — | As stated. |
| D4 | **Decided:** every threshold is the user's setting (junior to staff). Jobs whose listed max pay is below the user's floor are hidden; jobs with no salary listed are kept and labeled "salary not listed" (toggle "hide unlisted salary", default off). | — | As stated. |
| D5 | **Decided:** public-safe details only; fictional or permission-given contacts. | — | — |
| D6 | **Decided (pre-approved):** quiet, ChatGPT-native, one accent color; humor in copy, not visuals. No review gate. | — | — |
| D7 | **Decided:** §25 names as written, labeled "inspired by" Boris Cherny's public comments; add more assessment lenses (§25.7). | — | — |
| D8 | Auth fallback trigger (R2) | F2 + 90 min | Demo-only single-user mode behind a flag; OAuth continues on a branch. |
| D9 | P1 priority order if time is short | Sat 11:15 | P1-D brief → P1-H ladder → P1-C news → P1-B events → P1-A bridge → P1-E calculators. |

---

## 27. Progress and status UX

The user should always know what's happening. Use every layer ChatGPT gives us:

1. **Tool status lines (all tools, F4 enforces).** Each `ToolDef.status` maps to
   `_meta["openai/toolInvocation/invoking"]` and `…/invoked` (≤ 64 chars), shown by ChatGPT while and
   after the tool runs. Written in the §24 voice, e.g.:
   - `search_jobs`: "Asking the robots to rank your jobs…" → "Ranked. Still employable."
   - `refresh_jobs`: "Scanning job boards…" → "Fresh jobs in"
   - `assess_ai_level`: "Measuring your AI-native level…" → "Level computed"
   - `save_interview_intel`: "Filing the interview intel…" → "Intel saved"
   - `reset_my_data`: "Running rm -rf on your data…" → "Clean install complete"
2. **Fast first response, then progress.** No tool blocks longer than ~8s. Long work (scoring 60 jobs,
   multi-source refresh) returns immediately with what's ready plus a `progress` object
   (`{ stage: 'fetching'|'filtering'|'scoring'|'done', done, total }`); the panel shows a stepper
   ("Fetch → Filter → Score → Rank") and polls a lightweight status tool (`get_task_status`) until done.
   Also emit MCP progress notifications when the client sends a progress token (**VERIFY** ChatGPT
   support; harmless if ignored).
3. **Panel states.** Skeleton loaders (with §24 rotating loading lines), inline progress bars for
   batches ("Scoring 20 of 60…"), optimistic updates for saves, toasts for completed actions, and
   `ErrorBanner` with retry. Remember tab/filters via `setWidgetState`.
4. **Skills narrate briefly.** One short line before long steps ("Checking 6 job sources and scoring
   your top 60 matches, about 10 seconds.") and a one-line result after. No play-by-play.
5. **Source health.** Jobs tab footer shows each source's last successful fetch and any outage.

`get_task_status` (F4): read-only, returns progress for a task ID from `user_state`
(key `task.<id>`); added to the F tool list.

---

## 28. Company interview intel ("know the gauntlet")

**Problem:** software engineering interviews still mean LeetCode-style coding rounds and
whiteboard architecture, and every company's loop is different. Candidates who know the format and
likely problem patterns in advance do much better.

**How it works (no scraping, $0 to us):**
1. The `interview-intel` skill has ChatGPT **web-search** public sources for the company + role:
   company careers/engineering blogs that describe their own process, Glassdoor interview reviews,
   Blind, Reddit (r/cscareerquestions, r/ExperiencedDevs), LeetCode Discuss/company tags, Levels.fyi,
   and public interview-prep guides. ChatGPT reads what it can access on the user's plan; our server
   does not crawl these sites (their terms forbid scraping, and they block bots).
2. ChatGPT synthesizes a **structured report** and calls `save_interview_intel` with:
   - `stages[]`: e.g. recruiter screen → online assessment → technical phone screen → onsite
     (coding ×2, system design, behavioral) → team match, with durations if reported.
   - `coding`: problem **patterns** and difficulty (e.g. "graphs/BFS, intervals, LRU-cache-style
     design; mostly medium"), languages allowed, live vs. take-home, with links to practice problems
     of the same pattern.
   - `systemDesign`: likely prompts and themes ("design a rate limiter"), expected depth for the level.
   - `behavioral`: themes and values they probe.
   - `tips[]`, `redFlags[]`, `confidence` (`high|medium|low` based on recency and number of reports),
     `sources[]` (title, URL, date), `lastResearchedAt`.
3. The Prep tab renders it as an **Interview loop card**; `interview-prep` turns it into a study plan
   (days until interview → pattern drills + one mock design session), and `mock-interview` asks
   questions in the same patterns.

**Integrity rules (in the skill):** summarize and paraphrase with links; never reproduce paywalled
or copyrighted content verbatim; present **patterns**, not "the exact questions"; don't solicit or
share content that candidates were asked to keep confidential; flag thin or stale data with low
confidence instead of guessing.

**Later (P2):** practice tracker per pattern (done/struggled), spaced repetition, pairing intel
with the user's ladder level ("Level 4 tip: ask an agent to generate 10 interval problems, solve 3
without it").

---

## 29. Testing strategy (minimal, high-value)

**Yes, test, but only where a silent break would hurt users or kill the demo.** Prompts and skills
aren't unit-testable; deterministic code around them is. Target: ~25 fast tests total, run in
under 10 seconds, all in vitest (Worker/D1 ones via `@cloudflare/vitest-pool-workers`).

### 29.1 The must-have tests (in priority order)

| # | What | Why it matters | Owner |
|---|---|---|---|
| T1 | **User isolation:** for every user-scoped repo, user B can't read, update, or delete user A's rows (incl. update/delete by ID). One shared helper, one test per repo. | A cross-user data leak is the worst possible bug in a public multi-user app. | F3 helper; each feature adds one |
| T2 | **Reset scope:** `reset_my_data` deletes only the caller's personal rows; other users and global tables untouched; requires `confirm: "RESET"`. | Destructive tool on a public server. | F6 |
| T3 | **Auth guards:** user ID comes only from OAuth props (a `userId` tool arg is rejected/ignored); `DEV_AUTH_BYPASS` refuses to run when `ENVIRONMENT=production`; unauthenticated `/mcp` returns 401 with `WWW-Authenticate`. | Prevents impersonation and accidental open access. | F2 |
| T4 | **Tool contract check:** every registered tool has a unique snake_case name, description, all three required annotations, `status` strings ≤ 64 chars, `securitySchemes`, and (if it declares one) results that validate against its output schema. Snapshot the tool list. | Bad metadata breaks ChatGPT tool selection or plugin review, silently. | F4 |
| T5 | **Decisions wrapper:** batches split at `DECISIONS_BATCH_SIZE`; answer names map back to the right `jobId`; score 0–4 → 0–100; refusal, timeout, or HTTP error on one batch → heuristic for that batch only; daily cap enforced. API mocked. | Mis-mapped scores would put the wrong jobs at the top in the main demo moment. | F7 |
| T6 | **Candidate filters:** salary floor rules (listed below floor hidden; unlisted kept and labeled; toggle hides unlisted), remote/hybrid/onsite + location, avoid lists, employment type. Pure functions, table-driven. | "Why is this job here?" is the first thing a user checks. | P0-C |
| T7 | **Source normalization:** one recorded-fixture test per adapter (input JSON → `NormalizedJob`), HTML stripping + truncation, HN comment first-line parser, and "one adapter throws → others still upsert, `fetch_runs` records the error." | Feeds change shape; fixtures catch it immediately. | P0-A, P1-A, P1-C |
| T8 | **Pure math:** rate and runway calculators (P1-E), ladder heuristic level from answers (P1-H). | Cheap, and wrong money math is embarrassing. | P1-E, P1-H |

### 29.2 Deliberately not unit-tested

- **Skills/prompts and tool descriptions:** covered by the manual eval set in `docs/DEMO.md` (P0-F):
  ~15 prompts (direct, indirect, negative) run in ChatGPT after metadata changes.
- **Panel UI components:** verified by rendering with seed data during dry runs. No component tests.
- **Live third-party APIs:** only `scripts/smoke-decisions.ts` and `scripts/smoke-prod.ts`, run by
  hand, never in the test suite.
- **End-to-end ChatGPT flows:** the demo dry runs are the E2E test.

### 29.3 Rules

- Tests live next to code (`*.test.ts`), use the seed helpers, and never call the network.
- A failing T1–T5 blocks merge. T6–T8 failures are fixed before the next deploy.
- Bug found in a dry run → add one regression test only if it's in T1–T8 territory.

---

## 30. Audience invite ("try it right now")

At the end of the demo Todd invites the room to use it live. That's a wow moment only if it works
for 50 people at once, so plan for it.

**Landing page (P0-F):** `GET /` on the Worker serves a single static page (no auth):
- Name, tagline, the `@deprecated` joke, a one-paragraph pitch.
- **"Add to ChatGPT" steps** with the MCP URL (`https://<worker>/mcp`) and a copy button: ChatGPT
  desktop → Plugins → **+** → Add custom MCP server → paste URL → OAuth → Create as plugin → sign in
  with GitHub. **VERIFY** what audience accounts need (paid plan? custom MCP servers allowed on their
  plan/workspace?) and state it on the page so nobody gets stuck silently.
- 3 starter prompts to paste ("Where am I on the AI-Native Ladder?", "Find me remote staff
  engineer roles", "What's the interview loop at OpenAI like?").
- Link to the GitHub repo. The QR code points to this page (generate a static SVG at build time;
  no external QR service).

**Load and cost guardrails for a room full of new users:**
- `DECISIONS_DAILY_JOB_CAP` per user (default 300) plus **`DECISIONS_GLOBAL_DAILY_CAP`** (e.g. 20,000
  jobs/day) → beyond it, heuristic scoring with the usual banner. Same pattern for the optional
  dossier (`AGENTS_GLOBAL_DAILY_CAP`).
- Adzuna is called per distinct (query, location), cached for 6h in the `jobs` catalog (keyed by a
  `fetch_runs` entry), so 50 users in Salt Lake City cost one call, not 50.
- Workers Free limits (100k requests/day, D1 100k row writes/day) are fine for a demo room; keep
  the $5 upgrade ready if CPU errors appear.
- New users start empty, not with Todd's data: onboarding runs automatically on first tool call
  (`NEEDS_CRITERIA` → onboarding skill), and the Level tab works with zero setup (fastest "aha").
- Abuse: input size caps (already in §14), per-user rate limit on write tools (e.g. 60/min),
  `reset_my_data` available to everyone, and a `DISABLE_SIGNUPS=1` kill switch if anything goes
  sideways.

---

## 31. Speed strategy: precompute, don't cache

Rule: **anything slow runs before the user asks, and its result is stored in D1.** No separate cache
layer (no KV/Redis caching, no TTL invalidation logic) during the hackathon. The database *is* the
cache, and staleness is shown honestly ("updated 2h ago").

| Slow thing | Where it's precomputed/stored | When it runs |
|---|---|---|
| Fetching job feeds | `jobs` catalog | Cron (rotating batches), Adzuna per (query, location) with 6h freshness |
| Fit scoring | `job_matches.fit_score` keyed by `criteria_version` | In the background right after `update_criteria`/`save_resume` (`ctx.waitUntil`), after each cron fetch for users active in the last 7 days, and on demand in `search_jobs` for any remaining top candidates |
| Interview intel | `notes.kind='interview_intel'` | Once per company; "Refresh" re-runs it |
| AI news | `news_items` | Cron |
| Daily brief data | Assembled from the stored tables (fast reads) | On request |
| Ladder assessment | `ladder_assessments` | On request (one small Decisions call, ~1–2s) |

Request-time behavior: tools return stored results immediately; if work is still pending, include
`progress` (§27) and let the panel poll `get_task_status`. If `ctx.waitUntil` work is cut short
(**VERIFY** Workers limits for background work after a response), the next cron or `search_jobs` call
picks up the unscored remainder, so nothing is lost.

Decide-after-the-fact: only add a real cache layer if dry runs show a specific read is slow (e.g.
panel opening > 2s). Measure first with `wrangler tail` timings.
