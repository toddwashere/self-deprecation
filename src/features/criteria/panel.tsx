import { useCallback, useEffect, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import type { TabId } from "../../../web/src/tabs";
import { Button, Card, Chip, ErrorBanner, FormRow, Loading } from "../../../web/src/ui";
import { CRITERIA_COPY } from "./copy";
import { JourneyCard } from "./journey";
import type { CriteriaOutput } from "./tools";
import { TourPanel } from "./tour";

type ActionState =
  | { kind: "idle" }
  | { kind: "busy"; message: string }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

type RemotePreference = "remote" | "hybrid" | "onsite" | "any" | "";

interface CriteriaForm {
  targetTitles: string;
  skills: string;
  remotePref: RemotePreference;
  salaryMin: string;
  hourlyMin: string;
  bridgeMode: boolean;
}

const fieldStyle = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "9px 11px",
  color: "CanvasText",
  background: "transparent",
} as const;

function toForm(criteria: CriteriaOutput): CriteriaForm {
  return {
    targetTitles: criteria.targetTitles.join(", "),
    skills: criteria.skills.join(", "),
    remotePref: (criteria.remotePref as RemotePreference | null) ?? "",
    salaryMin: criteria.salaryMin?.toString() ?? "",
    hourlyMin: criteria.hourlyMin?.toString() ?? "",
    bridgeMode: criteria.bridgeMode,
  };
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseMinimum(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function isConfigured(criteria: CriteriaOutput): boolean {
  return criteria.targetTitles.length > 0 || criteria.skills.length > 0;
}

export function ProfilePanel({ bridge }: { bridge: Bridge }) {
  const [criteria, setCriteria] = useState<CriteriaOutput>();
  const [form, setForm] = useState<CriteriaForm>();
  const [error, setError] = useState<string>();
  const [action, setAction] = useState<ActionState>({ kind: "idle" });
  const [showTour, setShowTour] = useState(
    () => bridge.initialToolOutput<{ mode?: string }>()?.mode === "tour",
  );

  const loadCriteria = useCallback(async () => {
    setError(undefined);
    const result = await bridge.callTool<CriteriaOutput>("get_criteria");
    if (result.error) setError(result.error.message);
    else if (result.data) {
      setCriteria(result.data);
      setForm(toForm(result.data));
    } else setError(CRITERIA_COPY.missingProfile);
  }, [bridge]);

  useEffect(() => {
    void loadCriteria();
  }, [loadCriteria]);

  useEffect(
    () =>
      bridge.onToolOutput((output) => {
        if ((output as { mode?: string } | undefined)?.mode === "tour") setShowTour(true);
      }),
    [bridge],
  );

  const startChat = async (prompt: string) => {
    setAction({ kind: "busy", message: CRITERIA_COPY.starting });
    try {
      await bridge.sendPrompt(prompt);
      setAction({ kind: "done", message: CRITERIA_COPY.started });
    } catch (cause) {
      setAction({
        kind: "error",
        message: cause instanceof Error ? cause.message : CRITERIA_COPY.startError,
      });
    }
  };

  const loadDemo = async (): Promise<boolean> => {
    setAction({ kind: "busy", message: CRITERIA_COPY.loadingDemo });
    const result = await bridge.callTool<{ message?: string }>("load_demo_data");
    if (result.error) {
      setAction({ kind: "error", message: result.error.message });
      return false;
    }
    await loadCriteria();
    setAction({ kind: "done", message: CRITERIA_COPY.demoLoaded });
    return true;
  };

  const openTab = async (tab: TabId) => {
    const result = await bridge.callTool<{ tab: TabId }>("open_dashboard", { tab });
    if (result.error) setAction({ kind: "error", message: result.error.message });
  };

  const saveForm = async () => {
    if (!form) return;
    const salaryMin = parseMinimum(form.salaryMin);
    const hourlyMin = parseMinimum(form.hourlyMin);
    if (salaryMin === undefined || hourlyMin === undefined) {
      setAction({ kind: "error", message: CRITERIA_COPY.invalidCompensation });
      return;
    }
    setAction({ kind: "busy", message: CRITERIA_COPY.saving });
    const result = await bridge.callTool<CriteriaOutput>("update_criteria", {
      targetTitles: parseList(form.targetTitles),
      skills: parseList(form.skills),
      remotePref: form.remotePref || null,
      salaryMin,
      hourlyMin,
      bridgeMode: form.bridgeMode,
    });
    if (result.error || !result.data) {
      setAction({
        kind: "error",
        message: result.error?.message ?? CRITERIA_COPY.retry,
      });
      return;
    }
    setCriteria(result.data);
    setForm(toForm(result.data));
    setAction({ kind: "done", message: CRITERIA_COPY.saved });
  };

  if (!criteria && !error) return <Loading line={CRITERIA_COPY.loadingProfile} />;
  if (error)
    return <ErrorBanner message={`${CRITERIA_COPY.retry} ${error}`} retry={loadCriteria} />;
  if (!criteria) return null;

  const configured = isConfigured(criteria);
  const complete = criteria.targetTitles.length > 0 && criteria.skills.length > 0;
  const feedback = (
    <>
      {action.kind === "busy" ? <Loading line={action.message} /> : null}
      {action.kind === "done" ? <p className="success">{action.message}</p> : null}
      {action.kind === "error" ? <ErrorBanner message={action.message} /> : null}
    </>
  );

  if (showTour) {
    return (
      <div className="stack">
        <TourPanel
          configured={configured}
          onClose={() => setShowTour(false)}
          onDemo={async () => {
            if (await loadDemo()) setShowTour(false);
          }}
          onGetStarted={async () => {
            setShowTour(false);
            await startChat(configured ? CRITERIA_COPY.updatePrompt : CRITERIA_COPY.startPrompt);
          }}
        />
        {feedback}
      </div>
    );
  }

  return (
    <div className="stack">
      {configured ? (
        <JourneyCard
          criteria={criteria}
          onOpenJobs={() => openTab("jobs")}
          onRefine={() => startChat(CRITERIA_COPY.updatePrompt)}
        />
      ) : null}
      <Card>
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              {configured ? CRITERIA_COPY.configuredEyebrow : CRITERIA_COPY.eyebrow}
            </p>
            <h2>{configured ? CRITERIA_COPY.configuredTitle : CRITERIA_COPY.emptyTitle}</h2>
          </div>
          <Chip tone={complete ? "good" : "neutral"}>
            {complete
              ? CRITERIA_COPY.profileReady
              : configured
                ? CRITERIA_COPY.profileIncomplete
                : CRITERIA_COPY.setupNeeded}
          </Chip>
        </div>
        <p className="muted">
          {configured ? CRITERIA_COPY.configuredBody : CRITERIA_COPY.emptyBody}
        </p>

        {configured && form ? (
          <>
            <FormRow label={CRITERIA_COPY.targetTitles}>
              <input
                aria-label={CRITERIA_COPY.targetTitles}
                value={form.targetTitles}
                onChange={(event) => setForm({ ...form, targetTitles: event.target.value })}
                style={fieldStyle}
              />
              <div className="actions">
                {parseList(form.targetTitles).map((title) => (
                  <Chip key={title}>{title}</Chip>
                ))}
              </div>
            </FormRow>
            <FormRow label={CRITERIA_COPY.skills}>
              <input
                aria-label={CRITERIA_COPY.skills}
                value={form.skills}
                onChange={(event) => setForm({ ...form, skills: event.target.value })}
                style={fieldStyle}
              />
              <div className="actions">
                {parseList(form.skills)
                  .slice(0, 12)
                  .map((skill) => (
                    <Chip key={skill}>{skill}</Chip>
                  ))}
              </div>
            </FormRow>
            <FormRow label={CRITERIA_COPY.remotePreference}>
              <select
                aria-label={CRITERIA_COPY.remotePreference}
                value={form.remotePref}
                onChange={(event) =>
                  setForm({ ...form, remotePref: event.target.value as RemotePreference })
                }
                style={fieldStyle}
              >
                <option value="">{CRITERIA_COPY.notSet}</option>
                <option value="remote">{CRITERIA_COPY.remote}</option>
                <option value="hybrid">{CRITERIA_COPY.hybrid}</option>
                <option value="onsite">{CRITERIA_COPY.onsite}</option>
                <option value="any">{CRITERIA_COPY.anyWorkMode}</option>
              </select>
            </FormRow>
            <FormRow label={CRITERIA_COPY.salaryMinimum}>
              <input
                aria-label={CRITERIA_COPY.salaryMinimum}
                type="number"
                min="0"
                step="1000"
                value={form.salaryMin}
                onChange={(event) => setForm({ ...form, salaryMin: event.target.value })}
                style={fieldStyle}
              />
            </FormRow>
            <FormRow label={CRITERIA_COPY.hourlyMinimum}>
              <input
                aria-label={CRITERIA_COPY.hourlyMinimum}
                type="number"
                min="0"
                step="1"
                value={form.hourlyMin}
                onChange={(event) => setForm({ ...form, hourlyMin: event.target.value })}
                style={fieldStyle}
              />
            </FormRow>
            <label className="form-row">
              <span>{CRITERIA_COPY.bridgeMode}</span>
              <input
                type="checkbox"
                checked={form.bridgeMode}
                onChange={(event) => setForm({ ...form, bridgeMode: event.target.checked })}
              />
            </label>
            <p className="muted">
              {[criteria.seniority, criteria.remotePref, ...criteria.locations]
                .filter(Boolean)
                .join(" · ") || CRITERIA_COPY.workStyleOpen}
            </p>
            <p className="muted">
              {CRITERIA_COPY.resumeLabel}{" "}
              {criteria.hasResume ? CRITERIA_COPY.resumeSaved : CRITERIA_COPY.resumeMissing} ·{" "}
              {CRITERIA_COPY.criteriaVersion}
              {criteria.criteriaVersion}
            </p>
            <div className="actions">
              <Button disabled={action.kind === "busy"} onClick={() => void saveForm()}>
                {CRITERIA_COPY.save}
              </Button>
              <Button
                className="secondary"
                disabled={action.kind === "busy"}
                onClick={() => void startChat(CRITERIA_COPY.updatePrompt)}
              >
                {CRITERIA_COPY.updateInChat}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="actions">
              <Button
                disabled={action.kind === "busy"}
                onClick={() => void startChat(CRITERIA_COPY.startPrompt)}
              >
                {CRITERIA_COPY.getStarted}
              </Button>
              <Button
                className="secondary"
                disabled={action.kind === "busy"}
                onClick={() => void loadDemo()}
              >
                {CRITERIA_COPY.seeDemo}
              </Button>
              <Button
                className="secondary"
                disabled={action.kind === "busy"}
                onClick={() => setShowTour(true)}
              >
                {CRITERIA_COPY.quickTour}
              </Button>
            </div>
            <p className="muted">{CRITERIA_COPY.demoWarning}</p>
          </>
        )}

        {feedback}
      </Card>
    </div>
  );
}
