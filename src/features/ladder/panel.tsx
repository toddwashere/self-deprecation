import { useCallback, useEffect, useState } from "react";
import type { Bridge } from "../../../web/src/bridge";
import { Button, Card, Chip, Empty, ErrorBanner, Loading } from "../../../web/src/ui";
import { ladderCopy as copy } from "./copy";
import "./panel.css";
import type { LadderOutput } from "./tools";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAssessment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const scores = isRecord(value.dimensionScores) ? Object.values(value.dimensionScores) : [];
  return (
    typeof value.id === "string" &&
    Number.isInteger(value.level) &&
    Number(value.level) >= 1 &&
    Number(value.level) <= 5 &&
    Array.isArray(value.levelP) &&
    value.levelP.length === 5 &&
    value.levelP.every(
      (item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1,
    ) &&
    scores.length === 5 &&
    scores.every(
      (item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 4,
    ) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.source === "decisions" || value.source === "heuristic")
  );
}

function isQuest(value: unknown): boolean {
  const dimensions = ["tooling", "delegation", "verification", "parallelism", "automation"];
  return (
    isRecord(value) &&
    typeof value.questId === "string" &&
    Number.isInteger(value.level) &&
    Number(value.level) >= 2 &&
    Number(value.level) <= 5 &&
    typeof value.dimension === "string" &&
    dimensions.includes(value.dimension) &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    (value.status === "todo" || value.status === "done") &&
    (value.evidence === null || typeof value.evidence === "string") &&
    (value.completedAt === null || typeof value.completedAt === "number")
  );
}

export function isLadderOutput(value: unknown): value is LadderOutput {
  if (!isRecord(value) || value.tab !== "level") return false;
  if (value.assessment !== null && !isAssessment(value.assessment)) return false;
  if (!Array.isArray(value.quests) || !value.quests.every(isQuest)) return false;
  if (!Array.isArray(value.history) || !value.history.every(isAssessment)) return false;
  return value.fallback === undefined || typeof value.fallback === "boolean";
}

export function LevelPanel({ bridge }: { bridge: Bridge }) {
  const initial = bridge.initialToolOutput<unknown>();
  const [data, setData] = useState<LadderOutput | undefined>(
    isLadderOutput(initial) ? initial : undefined,
  );
  const [loading, setLoading] = useState(!isLadderOutput(initial));
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await bridge.callTool<LadderOutput>("get_ladder");
    if (result.error || !result.data) setError(result.error?.message ?? copy.error);
    else setData(result.data);
    setLoading(false);
  }, [bridge]);

  useEffect(() => {
    if (!isLadderOutput(initial)) void load();
    return bridge.onToolOutput((output) => {
      if (isLadderOutput(output)) {
        setData(output);
        setLoading(false);
        setError("");
      }
    });
  }, [bridge, initial, load]);

  const startAssessment = () =>
    bridge
      .sendPrompt(
        "Assess my AI-native engineering level. Ask the level-up questions one or two at a time.",
      )
      .catch(() => setError(copy.error));
  const requestPlan = () =>
    bridge
      .sendPrompt(
        "Use my saved AI-native ladder assessment and quests to build a practical two-week level-up plan.",
      )
      .catch(() => setError(copy.error));
  const changeQuest = async (questId: string, status: "todo" | "done") => {
    if (!data) return;
    const previous = data;
    setSaving(questId);
    setError("");
    setNotice("");
    setData({
      ...data,
      quests: data.quests.map((quest) =>
        quest.questId === questId
          ? {
              ...quest,
              status,
              completedAt: status === "done" ? Date.now() : null,
              evidence: evidence[questId]?.trim() || quest.evidence,
            }
          : quest,
      ),
    });
    const result = await bridge.callTool<LadderOutput>("update_quest", {
      questId,
      status,
      ...(evidence[questId]?.trim() ? { evidence: evidence[questId].trim() } : {}),
    });
    setSaving(undefined);
    if (result.error || !result.data) {
      setData(previous);
      setError(result.error?.message ?? copy.error);
      return;
    }
    setData(result.data);
    setNotice(copy.saved);
  };

  if (loading && !data) return <Loading line={copy.loading} />;
  if (error && !data) return <ErrorBanner message={error} retry={() => void load()} />;
  if (!data?.assessment)
    return (
      <div className="stack">
        <div>
          <h2>{copy.title}</h2>
          <p className="muted">{copy.subtitle}</p>
        </div>
        {error ? <ErrorBanner message={error} retry={() => void load()} /> : null}
        <Empty title={copy.emptyTitle}>
          {copy.empty}
          <span className="actions">
            <Button onClick={() => void startAssessment()}>{copy.assess}</Button>
          </span>
        </Empty>
      </div>
    );

  const assessment = data.assessment;
  const nextLevel = Math.min(5, assessment.level + 1);
  const topProbabilities = assessment.levelP
    .map((probability, index) => ({ level: index + 1, probability }))
    .filter((item) => item.probability > 0)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 2);

  return (
    <div className="stack">
      <div className="ladder-heading">
        <div>
          <h2>{copy.title}</h2>
          <p className="muted">{copy.subtitle}</p>
        </div>
        <div className="actions">
          <Button className="secondary" onClick={() => void startAssessment()}>
            {copy.reassess}
          </Button>
          <Button onClick={() => void requestPlan()}>{copy.plan}</Button>
        </div>
      </div>
      {error ? <ErrorBanner message={error} retry={() => void load()} /> : null}
      {notice ? (
        <p role="status" className="success">
          {notice}
        </p>
      ) : null}
      {data.fallback ? <p className="muted">{copy.fallback}</p> : null}
      <Card>
        <div className="ladder-level-row">
          <div>
            <p className="eyebrow">Current level</p>
            <h2>
              you@L{assessment.level} · {copy.levelNames[assessment.level]}
            </h2>
            <p className="muted">
              {assessment.level === 5
                ? "Keep building durable loops and evidence."
                : `Your active quests target Level ${nextLevel}: ${copy.levelNames[nextLevel]}.`}
            </p>
          </div>
          <Chip tone="good">
            {assessment.source === "decisions" ? "Decisions score" : "Local rubric"}
          </Chip>
        </div>
        {topProbabilities.some((item) => item.probability < 1) ? (
          <p className="muted">
            {topProbabilities
              .map((item) => `${Math.round(item.probability * 100)}% Level ${item.level}`)
              .join(" · ")}
          </p>
        ) : null}
        <p>{copy.hope}</p>
      </Card>
      <Card>
        <p className="eyebrow">{copy.dimensions}</p>
        <div className="ladder-score-grid">
          {Object.entries(copy.dimensionLabels).map(([dimension, label]) => {
            const value = assessment.dimensionScores[dimension] ?? 0;
            return (
              <div className="ladder-score-line" key={dimension}>
                <span>{label}</span>
                <div
                  className="ladder-track"
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={4}
                  aria-valuenow={value}
                >
                  <div className="ladder-fill" style={{ width: `${(value / 4) * 100}%` }} />
                </div>
                <strong>{value}/4</strong>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <p className="eyebrow">{copy.quests}</p>
        <div className="ladder-quests">
          {data.quests.map((quest) => (
            <div className={`ladder-quest ${quest.status}`} key={quest.questId}>
              <div className="ladder-quest-row">
                <div>
                  <h3>{quest.title}</h3>
                  <p className="muted">{quest.description}</p>
                </div>
                <Chip tone={quest.status === "done" ? "good" : "neutral"}>{quest.status}</Chip>
              </div>
              <input
                className="ladder-evidence"
                aria-label={`Evidence for ${quest.title}`}
                placeholder="Optional link or note"
                maxLength={2_000}
                value={evidence[quest.questId] ?? quest.evidence ?? ""}
                onChange={(event) =>
                  setEvidence((current) => ({ ...current, [quest.questId]: event.target.value }))
                }
              />
              <div className="actions">
                <Button
                  disabled={saving === quest.questId}
                  onClick={() =>
                    void changeQuest(quest.questId, quest.status === "done" ? "todo" : "done")
                  }
                >
                  {quest.status === "done" ? "Mark todo" : "Mark done"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="ladder-history-row">
          <div>
            <p className="eyebrow">{copy.history}</p>
            <p className="muted">
              {data.history.length} saved assessment{data.history.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="ladder-history" role="img" aria-label="Assessment level history">
            {[...data.history].reverse().map((item) => (
              <div
                className="ladder-history-bar"
                key={item.id}
                title={`Level ${item.level} · ${new Date(item.createdAt).toLocaleDateString()}`}
                style={{ height: `${item.level * 11}px` }}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
