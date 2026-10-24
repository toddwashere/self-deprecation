import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../mcp/types";
import { calculatorTools } from "./tools";

const context = {} as ToolContext;

function tool(name: string) {
  const found = calculatorTools.find((candidate) => candidate.name === name);
  expect(found, `${name} registered`).toBeDefined();
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

function errorCode(result: Awaited<ReturnType<(typeof calculatorTools)[number]["handler"]>>) {
  return (result._meta?.["self-deprecation/error"] as { code?: string } | undefined)?.code;
}

describe("calculator tools", () => {
  it("returns typed rate and runway results", async () => {
    const rate = await tool("calc_rate").handler({ annualSalary: 120_000 }, context);
    expect(rate.isError).not.toBe(true);
    expect(rate.structuredContent).toMatchObject({
      tab: "money",
      hourlyRate: 144.93,
      progress: { stage: "done", done: 1, total: 1 },
    });
    expect(tool("calc_rate").output?.safeParse(rate.structuredContent).success).toBe(true);

    const runway = await tool("calc_runway").handler(
      { liquidCash: 60_000, monthlyExpenses: 10_000, monthlyIncome: 2_500 },
      context,
    );
    expect(runway.isError).not.toBe(true);
    expect(runway.structuredContent).toMatchObject({
      tab: "money",
      runwayMonths: 8,
      sustainable: false,
    });
    expect(tool("calc_runway").output?.safeParse(runway.structuredContent).success).toBe(true);
  });

  it("rejects unsafe or impossible planning assumptions", async () => {
    expect(errorCode(await tool("calc_rate").handler({ annualSalary: -1 }, context))).toBe(
      "INVALID_INPUT",
    );
    expect(
      errorCode(
        await tool("calc_rate").handler({ annualSalary: 100_000, reservePercent: 100 }, context),
      ),
    ).toBe("INVALID_INPUT");
    expect(
      errorCode(await tool("calc_runway").handler({ liquidCash: -1, monthlyExpenses: 1 }, context)),
    ).toBe("INVALID_INPUT");
    expect(errorCode(await tool("calc_runway").handler({ monthlyExpenses: 1 }, context))).toBe(
      "INVALID_INPUT",
    );
  });

  it("publishes complete, bounded tool metadata", () => {
    expect(calculatorTools.map((candidate) => candidate.name)).toEqual([
      "calc_rate",
      "calc_runway",
    ]);
    for (const candidate of calculatorTools) {
      expect(candidate.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(candidate.status.invoking.length).toBeLessThanOrEqual(64);
      expect(candidate.status.invoked.length).toBeLessThanOrEqual(64);
      expect(candidate.description).toContain("Use");
      expect(candidate.description).toContain("Do not");
      expect(candidate.description).toContain("Next");
    }
  });
});
