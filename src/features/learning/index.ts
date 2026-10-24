import type { FeatureModule } from "../../mcp/types";
import { learningTools } from "./tools";

export const learningFeature = { id: "learning", tools: learningTools } satisfies FeatureModule;
