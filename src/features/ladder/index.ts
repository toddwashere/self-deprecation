import type { FeatureModule } from "../../mcp/types";
import { ladderTools } from "./tools";

export const ladderFeature = { id: "ladder", tools: ladderTools } satisfies FeatureModule;
