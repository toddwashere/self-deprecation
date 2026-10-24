import type { FeatureModule } from "../../mcp/types";
import { contractTools } from "./tools";

export const contractsFeature = { id: "contracts", tools: contractTools } satisfies FeatureModule;
