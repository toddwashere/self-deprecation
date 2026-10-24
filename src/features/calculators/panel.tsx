import { useEffect, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, FormRow, Loading } from "../../../web/src/ui";
import { CALCULATOR_COPY as copy } from "./copy";
import "./panel.css";
import { type CalculatorOutput, formatMoney, isCalculatorOutput } from "./panel-state";
import type { RateOutput, RunwayOutput } from "./tools";

type Mode = "rate" | "runway";
const fieldStyle = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "CanvasText",
  background: "transparent",
  font: "inherit",
  width: "100%",
} as const;
const rateFields = [
  ["annualSalary", "Annual salary"],
  ["benefitsPercent", "Benefits allowance (%)"],
  ["reservePercent", "Tax/overhead reserve (%)"],
  ["billableWeeks", "Billable weeks / year"],
  ["billableHoursPerWeek", "Billable hours / week"],
  ["hoursPerDay", "Hours / day"],
] as const;
const runwayFields = [
  ["liquidCash", "Liquid cash"],
  ["monthlyExpenses", "Monthly expenses"],
  ["monthlyIncome", "Monthly recurring income"],
  ["oneTimeCosts", "One-time costs"],
] as const;

function RateResult({ result }: { result: RateOutput }) {
  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Replacement contract target</p>
          <h2>{formatMoney(result.hourlyRate)} / hour</h2>
        </div>
        <Chip tone="good">{formatMoney(result.dayRate)} / day</Chip>
      </div>
      <dl className="money-summary">
        <dt>Monthly revenue</dt>
        <dd>{formatMoney(result.monthlyTarget)}</dd>
        <dt>Annual revenue</dt>
        <dd>{formatMoney(result.annualTarget)}</dd>
        <dt>Benefits allowance</dt>
        <dd>{result.assumptions.benefitsPercent}%</dd>
        <dt>Tax/overhead reserve</dt>
        <dd>{result.assumptions.reservePercent}%</dd>
        <dt>Billable time</dt>
        <dd>
          {result.assumptions.billableWeeks} weeks × {result.assumptions.billableHoursPerWeek} hours
        </dd>
      </dl>
    </Card>
  );
}

function RunwayResult({ result }: { result: RunwayOutput }) {
  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Estimated runway</p>
          <h2>{result.sustainable ? "No monthly shortfall" : `${result.runwayMonths} months`}</h2>
        </div>
        <Chip tone={result.sustainable || (result.runwayMonths ?? 0) >= 6 ? "good" : "neutral"}>
          {formatMoney(result.monthlyBurn)} / month
        </Chip>
      </div>
      <dl className="money-summary">
        <dt>Usable cash</dt>
        <dd>{formatMoney(result.usableCash)}</dd>
        <dt>Monthly expenses</dt>
        <dd>{formatMoney(result.assumptions.monthlyExpenses)}</dd>
        <dt>Monthly income</dt>
        <dd>{formatMoney(result.assumptions.monthlyIncome)}</dd>
        <dt>One-time costs</dt>
        <dd>{formatMoney(result.assumptions.oneTimeCosts)}</dd>
      </dl>
    </Card>
  );
}

export function MoneyPanel({ bridge }: { bridge: Bridge }) {
  const initial = bridge.initialToolOutput<unknown>();
  const initialResult = isCalculatorOutput(initial) ? initial : undefined;
  const [mode, setMode] = useState<Mode>(initialResult?.kind ?? "rate");
  const [result, setResult] = useState<CalculatorOutput | undefined>(initialResult);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [rate, setRate] = useState({
    annualSalary: "120000",
    benefitsPercent: "25",
    reservePercent: "25",
    billableWeeks: "46",
    billableHoursPerWeek: "30",
    hoursPerDay: "8",
  });
  const [runway, setRunway] = useState({
    liquidCash: "50000",
    monthlyExpenses: "8000",
    monthlyIncome: "0",
    oneTimeCosts: "0",
  });

  useEffect(
    () =>
      bridge.onToolOutput((output) => {
        if (isCalculatorOutput(output)) {
          setResult(output);
          setMode(output.kind);
          setError(undefined);
        }
      }),
    [bridge],
  );

  const calculate = async () => {
    setBusy(true);
    setError(undefined);
    const args = Object.fromEntries(
      Object.entries(mode === "rate" ? rate : runway).map(([key, value]) => [key, Number(value)]),
    );
    const response =
      mode === "rate"
        ? await bridge.callTool<RateOutput>("calc_rate", args)
        : await bridge.callTool<RunwayOutput>("calc_runway", args);
    setBusy(false);
    if (response.error || !response.data) setError(response.error?.message ?? copy.error);
    else setResult(response.data);
  };
  const values: Record<string, string> = mode === "rate" ? rate : runway;
  const fields = mode === "rate" ? rateFields : runwayFields;
  const updateValue = (key: string, value: string) => {
    if (mode === "rate") setRate({ ...rate, [key]: value });
    else setRunway({ ...runway, [key]: value });
  };

  return (
    <div className="stack money-panel" aria-busy={busy}>
      <div>
        <h2>{copy.title}</h2>
        <p className="muted">{copy.subtitle}</p>
        <p>{copy.intro}</p>
      </div>
      <div className="actions money-switch" role="tablist" aria-label="Money calculators">
        <Button aria-selected={mode === "rate"} onClick={() => setMode("rate")} role="tab">
          Rate
        </Button>
        <Button aria-selected={mode === "runway"} onClick={() => setMode("runway")} role="tab">
          Runway
        </Button>
      </div>
      <Card>
        <h2>{mode === "rate" ? copy.rateTitle : copy.runwayTitle}</h2>
        <p className="muted">{mode === "rate" ? copy.rateDescription : copy.runwayDescription}</p>
        <form
          className="money-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void calculate();
          }}
        >
          {fields.map(([key, label]) => (
            <FormRow key={key} label={label}>
              <input
                aria-label={label}
                min="0"
                step="any"
                type="number"
                value={values[key]}
                onChange={(event) => updateValue(key, event.target.value)}
                style={fieldStyle}
              />
            </FormRow>
          ))}
          <div className="actions">
            <Button disabled={busy} type="submit">
              {mode === "rate" ? "Calculate rate" : "Calculate runway"}
            </Button>
          </div>
        </form>
      </Card>
      {error ? <ErrorBanner message={error} /> : null}
      {busy ? <Loading line={copy.loading} /> : null}
      {!result && !busy && !error ? (
        <Empty title="No estimate yet">Enter assumptions, then calculate.</Empty>
      ) : null}
      {result?.kind === "rate" ? <RateResult result={result} /> : null}
      {result?.kind === "runway" ? <RunwayResult result={result} /> : null}
      <p className="muted money-disclaimer">{copy.disclaimer}</p>
    </div>
  );
}
