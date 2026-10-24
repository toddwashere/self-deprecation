# Tool catalog

All tools use OAuth scope `mcp:read`. Tool handlers receive the internal user ID only from verified
OAuth grant props (or the guarded local development identity). Structured result schemas are the
server/panel contract.

| Tool | Feature | Effect | Opens panel | Purpose |
|---|---|---:|---:|---|
| `ping` | core | read-only | yes | Verify the MCP connection and UI resource. |
| `get_profile` | core | read-only | no | Return the verified signed-in identity. |
| `get_task_status` | core | read-only | no | Poll a long-running task owned by the caller. |
| `open_dashboard` | core | read-only | yes | Open the shared panel on a requested tab with summary counts. |
| `reset_my_data` | core | destructive | no | Reset only the caller's personal workspace after exact confirmation. |
| `load_demo_data` | core | destructive | no | Replace the caller's workspace with deterministic public-safe demo data. |
| `start_onboarding` | criteria | read-only | yes | Start or resume conversational job-search setup. |
| `get_criteria` | criteria | read-only | no | Return the caller's current criteria; resume text is opt-in. |
| `update_criteria` | criteria | write | no | Partially update only the caller's confirmed criteria. |
| `save_resume` | criteria | write | no | Save ≤50 KB resume text and supported extracted fields. |
| `show_product_tour` | criteria | read-only | yes | Open the replayable product tour without changing criteria. |
| `refresh_jobs` | jobs | open-world write | no | Refresh a bounded set of public job sources, with partial progress and source errors. |
| `search_jobs` | jobs | read + bounded scoring | yes | Filter and rank jobs against the caller's criteria. |
| `get_job` | jobs | read-only | yes | Open one public job with the caller's saved match state. |
| `update_job_status` | jobs | write | yes | Save, dismiss, or update application progress for one job. |
| `score_jobs` | jobs | bounded scoring | yes | Score the next matching batch while preserving the initiating filters. |
| `add_contact` | people | write | yes | Add a contact to the caller's private network. |
| `update_contact` | people | write | yes | Update a caller-owned contact. |
| `list_contacts` | people | read-only | yes | Browse or filter caller-owned contacts. |
| `add_note` | people | write | yes | Save private context for a contact, event, job, or general subject. |
| `list_notes` | people | read-only | yes | Read caller-owned notes with bounded pagination. |
| `get_prep_context` | prep | read-only | yes | Assemble job, criteria, contact, and saved interview context. |
| `save_prep` | prep | write | yes | Save a caller-owned interview preparation note. |
| `save_interview_intel` | prep | write | yes | Save structured interview-stage intelligence. |
| `get_interview_intel` | prep | read-only | yes | Read saved interview intelligence for a job. |
| `save_event` | events | open-world write | yes | Save an event and optionally enrich its public metadata. |
| `list_events` | events | read-only | yes | List caller-owned events with filters and pagination. |
| `update_event` | events | write | yes | Update a caller-owned event or its status. |
| `get_ai_news` | news | read-only | yes | Read normalized AI news with source freshness and partial-failure status. |
| `get_brief_data` | today | read-only | yes | Assemble the caller's bounded daily brief and continuation state. |
| `mark_brief_seen` | today | write | yes | Advance the caller's monotonic brief watermark. |
| `save_learning_entry` | journal | write | yes | Capture a private reference, talk, experiment, or reflection. |
| `list_learning_entries` | journal | read-only | yes | Browse caller-owned journal entries with filters and pagination. |
| `get_learning_entry` | journal | read-only | yes | Open one caller-owned journal entry. |
| `update_learning_entry` | journal | write | yes | Edit, pin, or archive a caller-owned journal entry. |
| `search_learning_entries` | journal | read-only | yes | Search the caller's journal text and tags. |
| `assess_ai_level` | growth | bounded scoring | yes | Assess five AI-native dimensions with Decisions and a deterministic fallback. |
| `get_ladder` | growth | read-only | yes | Read the caller's latest level, dimension scores, and active quests. |
| `update_quest` | growth | write | yes | Update a caller-owned quest status or evidence without erasing omitted fields. |

Feature folders are predeclared in `src/mcp/registry.ts`. Adding a tool to a feature's exported
`tools` array registers it automatically with annotations, status text, OAuth metadata, and optional
panel metadata.

## Known gaps

- Scheduled Adzuna refresh still lacks a shared active-user query; on-demand refresh is bounded and
  available now.
- The native ChatGPT scheduled-task flow for the daily brief must be verified after production
  deployment; the manual **Run my brief** path is complete.
