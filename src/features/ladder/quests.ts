export const DIMENSIONS = [
  "tooling",
  "delegation",
  "verification",
  "parallelism",
  "automation",
] as const;

export type LadderDimension = (typeof DIMENSIONS)[number];

export interface QuestDefinition {
  questId: string;
  level: number;
  dimension: LadderDimension;
  title: string;
  description: string;
}

export const QUESTS: QuestDefinition[] = [
  {
    questId: "l2-explain-file",
    level: 2,
    dimension: "tooling",
    title: "Explain one unfamiliar file",
    description: "Ask an AI chat to explain it, then verify one claim in the code.",
  },
  {
    questId: "l2-test-snippet",
    level: 2,
    dimension: "verification",
    title: "Verify an AI-generated snippet",
    description: "Use it in a small change and add a test that would catch a wrong answer.",
  },
  {
    questId: "l2-repeatable-prompt",
    level: 2,
    dimension: "delegation",
    title: "Save a repeatable prompt",
    description: "Turn one recurring coding question into a prompt you can reuse.",
  },
  {
    questId: "l3-delegate-bug",
    level: 3,
    dimension: "delegation",
    title: "Delegate one complete bug fix",
    description: "Give a coding agent the issue and review its diff instead of writing the fix.",
  },
  {
    questId: "l3-agents-file",
    level: 3,
    dimension: "tooling",
    title: "Write an AGENTS.md",
    description: "Capture one repository's constraints and compare the next agent result.",
  },
  {
    questId: "l3-test-gate",
    level: 3,
    dimension: "verification",
    title: "Make tests the done condition",
    description: "Reject one agent change until its relevant test fails first and then passes.",
  },
  {
    questId: "l4-parallel-worktrees",
    level: 4,
    dimension: "parallelism",
    title: "Run two agents in parallel",
    description: "Use separate worktrees and a written spec, then merge both verified changes.",
  },
  {
    questId: "l4-written-plan",
    level: 4,
    dimension: "delegation",
    title: "Delegate from a written plan",
    description: "Write acceptance criteria before handing a multi-file feature to an agent.",
  },
  {
    questId: "l4-ci-review",
    level: 4,
    dimension: "verification",
    title: "Gate an agent change in CI",
    description: "Require tests, lint, and a diff review before the change can land.",
  },
  {
    questId: "l5-scheduled-agent",
    level: 5,
    dimension: "automation",
    title: "Schedule one useful agent task",
    description: "Run it on weekdays and have it report only meaningful changes.",
  },
  {
    questId: "l5-build-capability",
    level: 5,
    dimension: "tooling",
    title: "Build an MCP server or skill",
    description: "Give an agent one focused capability it did not have before.",
  },
  {
    questId: "l5-track-eval",
    level: 5,
    dimension: "verification",
    title: "Track one agent eval",
    description: "Define a repeatable success check and observe it for a week.",
  },
];

export function questsForLevel(level: number): QuestDefinition[] {
  const target = Math.min(5, Math.max(2, level + 1));
  return QUESTS.filter((quest) => quest.level === target).slice(0, 3);
}
