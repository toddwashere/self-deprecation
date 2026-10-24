import { useEffect, useRef, useState } from "react";
import { Button, Card, Chip } from "../../../web/src/ui";
import { CRITERIA_COPY } from "./copy";

interface TourPanelProps {
  configured: boolean;
  onGetStarted: () => void | Promise<void>;
  onDemo: () => void | Promise<void>;
  onClose: () => void;
}

const loopStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
  gap: 8,
  margin: "18px 0",
  padding: 0,
  listStyle: "none",
} as const;

const stageStyle = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "9px 10px",
  textAlign: "center",
  fontSize: 12,
} as const;

export function TourPanel({ configured, onGetStarted, onDemo, onClose }: TourPanelProps) {
  const [index, setIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = CRITERIA_COPY.tourSteps[index];
  const final = index === CRITERIA_COPY.tourSteps.length - 1;

  useEffect(() => {
    if (step.id) headingRef.current?.focus();
  }, [step.id]);

  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{CRITERIA_COPY.tourEyebrow}</p>
          <p className="muted" aria-live="polite">
            {CRITERIA_COPY.tourProgress} {index + 1} {CRITERIA_COPY.tourOf}{" "}
            {CRITERIA_COPY.tourSteps.length}
          </p>
        </div>
        <Chip tone="good">{step.label}</Chip>
      </div>

      <ul style={loopStyle} aria-label={CRITERIA_COPY.tourStepsLabel}>
        {CRITERIA_COPY.tourSteps.map((candidate, candidateIndex) => (
          <li
            key={candidate.id}
            style={{
              ...stageStyle,
              borderColor: candidateIndex === index ? "var(--accent)" : "var(--border)",
              color: candidateIndex === index ? "var(--accent)" : "var(--muted)",
            }}
          >
            {candidate.label}
          </li>
        ))}
      </ul>

      <h2 ref={headingRef} tabIndex={-1}>
        {step.heading}
      </h2>
      <p>{step.body}</p>

      <div className="actions">
        {index > 0 ? (
          <Button className="secondary" onClick={() => setIndex((current) => current - 1)}>
            {CRITERIA_COPY.tourBack}
          </Button>
        ) : null}
        {!final ? (
          <Button onClick={() => setIndex((current) => current + 1)}>
            {CRITERIA_COPY.tourNext}
          </Button>
        ) : (
          <>
            <Button onClick={() => void onGetStarted()}>
              {configured ? CRITERIA_COPY.tourReview : CRITERIA_COPY.tourSetup}
            </Button>
            <Button className="secondary" onClick={() => void onDemo()}>
              {CRITERIA_COPY.tourDemo}
            </Button>
          </>
        )}
        <Button className="secondary" onClick={onClose}>
          {final ? CRITERIA_COPY.tourClose : CRITERIA_COPY.tourSkip}
        </Button>
      </div>
    </Card>
  );
}
