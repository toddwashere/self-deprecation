# Onboarding choice design

## Intent

Replace the empty Foundation dashboard dead end with a user-controlled first run. A new user chooses **Get started** for a short conversational setup or **See demo** for public-safe sample data. Returning users go straight to their profile/dashboard.

## Goals

- “Get started,” “set up my job search,” and criteria-dependent requests reliably begin onboarding.
- Ask no more than six short groups of questions, one or two at a time.
- Summarize and confirm before saving criteria; resume sharing stays optional.
- The Profile tab renders loading, empty choice, error, configured summary, and action states.
- Demo loading remains clearly labeled as replacement behavior and opens a populated workspace.

## Non-goals

- Do not auto-run on plugin installation or connection.
- Do not implement job search/scoring, native structured settings, or extended forms here.
- Do not infer salary, experience, precise location, or resume facts.

## Chosen approach

Use all three discoverability layers: an explicit `start_onboarding` MCP tool, a packaged onboarding skill, and a Profile-panel empty-state choice. Server instructions cover direct custom-MCP installations where the packaged skill is unavailable. Criteria-dependent tools may later return `NEEDS_CRITERIA` and feed the same flow.

Alternatives rejected: skill-only onboarding is hard to discover; silently starting on connection is unsupported and intrusive; a UI-only wizard loses ChatGPT’s conversational advantage.

## Behavior

- Foundation routes an empty user to Profile when `open_dashboard` receives no explicit tab.
- **Get started** sends a follow-up prompt asking ChatGPT to call `start_onboarding` and ask one or two questions at a time.
- **See demo** calls the existing `load_demo_data`, then refreshes the Profile panel.
- `start_onboarding` reports existing criteria, missing fields, and the next question groups without writing.
- `get_criteria`, `update_criteria`, and `save_resume` read/write only `ToolContext.userId`; updates bump `criteria_version`.
- The skill gathers answers, confirms a summary, writes once, and opens Profile. It invokes job search only when that later tool is available.

## Constraints

- Resume text is at most 50 KB and is never logged or returned unless explicitly requested.
- Tool metadata follows the frozen MCP contract and voice guide.
- User isolation tests cover read and update behavior.
- All panel server calls go through `web/src/bridge.ts`; no direct network requests.
