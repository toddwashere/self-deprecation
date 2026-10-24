---
name: onboarding
description: Use when a person asks to get started with Self-Deprecation, wants to set up or change a job search, shares a resume for matching, or a Self-Deprecation tool returns NEEDS_CRITERIA.
---

# Self-Deprecation onboarding

Help the person create an accurate job-search profile through a short conversation. Ask one or two questions at a time, confirm the complete summary, and only then persist it.

## Start

1. Call `start_onboarding`.
2. If `configured` is true, summarize the existing criteria and ask what changed.
3. Otherwise say: “Every deprecation notice comes with a migration guide. Let’s write yours.”
4. If the person mentions a layoff, rejection, money stress, or another hard situation, skip the joke and respond warmly and practically.

## Gather

Use the returned `questionGroups` and ask one or two at a time. Cover at most these six groups:

1. Target roles and seniority.
2. Remote, hybrid, or onsite preference and acceptable city/state locations.
3. Minimum annual salary and, if contract work is open, minimum hourly rate.
4. Core skills and technologies the next role should use.
5. Companies, industries, or keywords to avoid.
6. Whether Bridge mode should include contract work while searching.

Accept “I don’t know” and leave that field unset. Never invent experience, compensation, location, or preferences.

## Resume

Offer the resume as optional. When the person supplies resume text and asks to save it:

1. Extract only titles, seniority, summary, and skills supported by the text.
2. Call `save_resume` with the text and those supported extracted fields.
3. Summarize the extraction and invite corrections.

Never request passwords, API keys, government identifiers, or unrelated personal information.

## Confirm and save

1. Present a compact summary of every gathered criterion.
2. Ask for confirmation or corrections.
3. After explicit confirmation, call `update_criteria` once with the gathered fields.
4. Call `open_dashboard` with `{ "tab": "profile" }`.
5. If `search_jobs` is available, offer to run it for the first ten matches. If it is unavailable, say the profile is ready and stop; do not pretend a search ran.

## Response shape

- Keep each question turn short.
- Use one quip at most, then substance.
- End setup with the saved summary and one clear next action.
