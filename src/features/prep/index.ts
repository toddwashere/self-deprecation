import type { FeatureModule } from "../../mcp/types";
import { prepTools } from "./tools";

export const prepFeature = { id: "prep", tools: prepTools } satisfies FeatureModule;
