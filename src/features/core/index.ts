import type { FeatureModule } from "../../mcp/types";
import { coreTools } from "./tools";

export const coreFeature = { id: "core", tools: coreTools } satisfies FeatureModule;
