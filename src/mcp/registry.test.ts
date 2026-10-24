import { describe, expect, it } from "vitest";
import { FEATURES, listTools } from "./registry";

describe("tool registry contract", () => {
  it("predeclares every feature module", () => {
    expect(FEATURES.map((feature) => feature.id)).toEqual([
      "core",
      "criteria",
      "jobs",
      "scoring",
      "crm",
      "prep",
      "contracts",
      "events",
      "news",
      "brief",
      "learning",
      "calculators",
      "dossier",
      "ladder",
    ]);
  });

  it("enforces unique, review-safe tool metadata", () => {
    const tools = listTools();
    expect(tools.map((tool) => tool.name)).toMatchInlineSnapshot(`
      [
        "ping",
        "get_profile",
        "get_task_status",
        "open_dashboard",
        "reset_my_data",
        "load_demo_data",
        "start_onboarding",
        "get_criteria",
        "update_criteria",
        "save_resume",
        "show_product_tour",
        "refresh_jobs",
        "search_jobs",
        "get_job",
        "update_job_status",
        "score_jobs",
        "add_contact",
        "update_contact",
        "list_contacts",
        "add_note",
        "list_notes",
        "get_prep_context",
        "save_prep",
        "save_interview_intel",
        "get_interview_intel",
        "save_event",
        "list_events",
        "update_event",
        "get_ai_news",
        "get_brief_data",
        "mark_brief_seen",
        "save_learning_entry",
        "list_learning_entries",
        "get_learning_entry",
        "update_learning_entry",
        "search_learning_entries",
        "assess_ai_level",
        "get_ladder",
        "update_quest",
      ]
    `);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);

    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
      expect(tool.description).toContain("Use");
      expect(tool.description).toContain("Do not");
      expect(tool.description).toContain("Next");
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
      expect(tool.status.invoking.length).toBeLessThanOrEqual(64);
      expect(tool.status.invoked.length).toBeLessThanOrEqual(64);
    }
  });
});
