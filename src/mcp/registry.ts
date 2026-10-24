import { briefFeature } from "../features/brief";
import { calculatorsFeature } from "../features/calculators";
import { contractsFeature } from "../features/contracts";
import { coreFeature } from "../features/core";
import { criteriaFeature } from "../features/criteria";
import { crmFeature } from "../features/crm";
import { dossierFeature } from "../features/dossier";
import { eventsFeature } from "../features/events";
import { jobsFeature } from "../features/jobs";
import { ladderFeature } from "../features/ladder";
import { learningFeature } from "../features/learning";
import { newsFeature } from "../features/news";
import { prepFeature } from "../features/prep";
import { scoringFeature } from "../features/scoring";
import type { FeatureModule, ToolDef } from "./types";

export const FEATURES: FeatureModule[] = [
  coreFeature,
  criteriaFeature,
  jobsFeature,
  scoringFeature,
  crmFeature,
  prepFeature,
  contractsFeature,
  eventsFeature,
  newsFeature,
  briefFeature,
  learningFeature,
  calculatorsFeature,
  dossierFeature,
  ladderFeature,
];

export function listTools(): ToolDef[] {
  return FEATURES.flatMap((feature) => feature.tools);
}
