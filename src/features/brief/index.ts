import type { FeatureModule } from "../../mcp/types";
import { briefTools } from "./tools";

export const briefFeature = { id: "brief", tools: briefTools } satisfies FeatureModule;
