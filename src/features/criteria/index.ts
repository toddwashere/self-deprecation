import type { FeatureModule } from "../../mcp/types";
import { criteriaTools } from "./tools";

export const criteriaFeature = { id: "criteria", tools: criteriaTools } satisfies FeatureModule;
