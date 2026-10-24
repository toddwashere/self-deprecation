# P1-E — Rate and runway calculators

## Approach

Ship two fast, deterministic tools and one secondary Money panel. Keep every assumption explicit in
the result instead of implying financial advice. `calc_rate` converts salary into a replacement
contract revenue target using benefits, a tax/overhead reserve, billable weeks/hours, and day length.
`calc_runway` divides usable cash by net monthly burn and treats zero/negative burn as sustainable
rather than inventing an infinite number. Round displayed money/months to cents; retain formulas in
pure functions for T8.

## Files

- `src/features/calculators/math.ts` and `math.test.ts`
- `src/features/calculators/tools.ts` and `tools.test.ts`
- `src/features/calculators/copy.ts`
- `src/features/calculators/panel.tsx` and `panel.css`
- `src/features/calculators/index.ts`

## Tool shapes and panel

- `calc_rate({ annualSalary, benefitsPercent?, reservePercent?, billableWeeks?,
  billableHoursPerWeek?, hoursPerDay? })` → `{ tab:'money', annualTarget, monthlyTarget, hourlyRate,
  dayRate, assumptions, progress }`.
- `calc_runway({ liquidCash, monthlyExpenses, monthlyIncome?, oneTimeCosts? })` →
  `{ tab:'money', usableCash, monthlyBurn, runwayMonths, sustainable, assumptions, progress }`.
- Panel: literal Rate and Runway forms, initial guidance, loading state, typed error, and result cards.
  It calls only through `Bridge` and is not primary navigation.

## Tests

- T8 exact rate math, default assumptions, decimal rounding, and reject impossible reserve/billable
  values through the actual tool handler.
- T8 runway with positive burn, upfront costs, zero cash, and zero/negative burn.
- Output schemas accept both tool results; tools remain fast, read-only, closed-world operations.

## Open questions

- `[local]` Use benefits 25%, tax/overhead reserve 25%, 46 billable weeks, 30 billable hours/week,
  and 8 hours/day as visible editable defaults. These are planning assumptions, not advice.
- `[contract]` Integrator must add both tool names to the frozen registry snapshot and `docs/TOOLS.md`,
  wire `MoneyPanel` as a hidden/secondary `tab:'money'` destination, rebuild, deploy, and verify.
