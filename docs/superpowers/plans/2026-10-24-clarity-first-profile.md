# Clarity-First Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Profile onboarding and returning-user UI so it communicates current state and one useful next action without exposing product requirements or roadmap prose.

**Architecture:** Keep existing P0-B tool and route contracts. Centralize revised strings in `src/features/criteria/copy.ts`, reduce `TourPanel` to one explanation per step, and reduce `JourneyCard` to one state-derived recommendation.

**Tech Stack:** TypeScript, React, Vite single-file panel, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-10-24-clarity-first-profile-design.md`

## Global Constraints

- Edit only P0-B-owned feature and skill paths, plus required task/process documentation and deterministic generated panel output.
- Do not edit frozen shared shell files; log shared-copy requests for the integrator.
- Keep labels and buttons literal, at most one joke per screen, and no user-authored content in humor.
- UI behavior is verified visually per PLAN §29.2; do not add a component-test stack.

## Review Focus

- Empty users immediately understand what setup does and can choose setup, demo, or tour.
- Tour screens stay readable at narrow width and contain no architecture or roadmap copy.
- Incomplete configured profiles recommend completing criteria; complete profiles recommend reviewing jobs.
- Loading and error states remain explicit after copy simplification.
- Dark and light host themes preserve readable contrast.

---

### Task 1: Simplify owned copy and presentation

**Files:**
- Modify: `src/features/criteria/copy.ts`
- Modify: `src/features/criteria/tour.tsx`
- Modify: `src/features/criteria/journey.tsx`
- Modify: `src/features/criteria/panel.tsx`
- Modify: `src/features/criteria/tools.ts`
- Modify: `skills/onboarding/SKILL.md`

**Interfaces:**
- Consumes: existing criteria state and panel bridge callbacks.
- Produces: unchanged tool and route contracts with a simpler visual hierarchy.

- [ ] Remove separate quip, hope, technical, roadmap, and four-card framework content.
- [ ] Render one next-step card from `targetTitles`, `skills`, and the existing callbacks.
- [ ] Replace feature statuses and onboarding opener with literal language.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm test`; commit the working step.

### Task 2: Build, inspect, and deploy

**Files:**
- Regenerate: `src/mcp/panel-html.generated.ts`

**Interfaces:**
- Consumes: Task 1 panel implementation.
- Produces: deployed single-file MCP App resource with unchanged URI and MIME type.

- [ ] Run `npm run build:web`; verify the generated panel remains below 400 KB gzip.
- [ ] Inspect empty, tour, incomplete/ready configured, loading/error, narrow, light, and dark states.
- [ ] Run the full repository verification gate and deploy to Workers.
- [ ] Smoke production, commit any deterministic generated output, and push the branch.
