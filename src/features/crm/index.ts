import type { FeatureModule } from "../../mcp/types";
import { crmTools } from "./tools";
export const crmFeature = { id: "crm", tools: crmTools } satisfies FeatureModule;
