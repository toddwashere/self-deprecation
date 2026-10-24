import type { TabId } from "../../../web/src/tabs";
import { Button, Card, Chip } from "../../../web/src/ui";
import { CRITERIA_COPY } from "./copy";
import type { CriteriaOutput } from "./tools";

interface JourneyCardProps {
  criteria: CriteriaOutput;
  onOpenTab: (tab: TabId) => void | Promise<void>;
  onReview: () => void | Promise<void>;
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  marginTop: 16,
} as const;

const areaStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  minHeight: 180,
  border: "1px solid var(--border)",
  borderRadius: 11,
  padding: 13,
} as const;

export function JourneyCard({ criteria, onOpenTab, onReview }: JourneyCardProps) {
  const needsFocus = criteria.targetTitles.length === 0 || criteria.skills.length === 0;
  const recommended = needsFocus ? "focus" : "move";
  const areas = [
    {
      id: "orient",
      label: CRITERIA_COPY.orientLabel,
      summary: `${CRITERIA_COPY.orientProfileReady} ${
        criteria.hasResume ? CRITERIA_COPY.orientResumeSaved : CRITERIA_COPY.orientResumeMissing
      }`,
      action: CRITERIA_COPY.reviewProfile,
      run: () => onOpenTab("profile"),
    },
    {
      id: "focus",
      label: CRITERIA_COPY.focusLabel,
      summary: needsFocus ? CRITERIA_COPY.focusMissing : CRITERIA_COPY.focusReady,
      action: CRITERIA_COPY.refineCriteria,
      run: () => onOpenTab("profile"),
    },
    {
      id: "move",
      label: CRITERIA_COPY.moveLabel,
      summary: CRITERIA_COPY.moveReady,
      action: CRITERIA_COPY.reviewJobs,
      run: () => onOpenTab("jobs"),
    },
    {
      id: "evolve",
      label: CRITERIA_COPY.evolveLabel,
      summary: CRITERIA_COPY.evolveReady,
      action: CRITERIA_COPY.runReview,
      run: onReview,
      planned: CRITERIA_COPY.learningJournal,
    },
  ];

  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{CRITERIA_COPY.journeyEyebrow}</p>
          <h2>{CRITERIA_COPY.journeyTitle}</h2>
        </div>
      </div>
      <p className="muted">{CRITERIA_COPY.journeyBody}</p>
      <div style={gridStyle}>
        {areas.map((area) => (
          <section
            key={area.id}
            style={{
              ...areaStyle,
              borderColor: area.id === recommended ? "var(--accent)" : "var(--border)",
            }}
          >
            <div className="card-heading" style={{ width: "100%" }}>
              <strong>{area.label}</strong>
              {area.id === recommended ? (
                <Chip tone="good">{CRITERIA_COPY.recommended}</Chip>
              ) : null}
            </div>
            <p className="muted" style={{ flex: 1 }}>
              {area.summary}
            </p>
            {area.planned ? (
              <p className="muted">
                {area.planned} · {CRITERIA_COPY.planned}
              </p>
            ) : null}
            <div className="actions" style={{ marginBottom: 0 }}>
              <Button className="secondary" onClick={() => void area.run()}>
                {area.action}
              </Button>
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
