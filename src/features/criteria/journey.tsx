import { Button, Card } from "../../../web/src/ui";
import { CRITERIA_COPY } from "./copy";
import type { CriteriaOutput } from "./tools";

interface JourneyCardProps {
  criteria: CriteriaOutput;
  onRefine: () => void | Promise<void>;
  onOpenJobs: () => void | Promise<void>;
}

export function JourneyCard({ criteria, onRefine, onOpenJobs }: JourneyCardProps) {
  const needsTitles = criteria.targetTitles.length === 0;
  const needsSkills = criteria.skills.length === 0;
  const needsFocus = needsTitles || needsSkills;
  const title = needsTitles
    ? CRITERIA_COPY.addTitlesTitle
    : needsSkills
      ? CRITERIA_COPY.addSkillsTitle
      : CRITERIA_COPY.reviewJobsTitle;
  const body = needsTitles
    ? CRITERIA_COPY.addTitlesBody
    : needsSkills
      ? CRITERIA_COPY.addSkillsBody
      : CRITERIA_COPY.reviewJobsBody;
  const action = needsFocus ? CRITERIA_COPY.refineCriteria : CRITERIA_COPY.reviewJobs;
  const run = needsFocus ? onRefine : onOpenJobs;

  return (
    <Card>
      <div className="card-heading">
        <div>
          <p className="eyebrow">{CRITERIA_COPY.nextStep}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <p className="muted">{body}</p>
      <div className="actions">
        <Button onClick={() => void run()}>{action}</Button>
      </div>
    </Card>
  );
}
