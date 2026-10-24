import type { FeatureModule } from "../../mcp/types";
import { calculatorTools } from "./tools";

export const calculatorsFeature = {
  id: "calculators",
  tools: calculatorTools,
} satisfies FeatureModule;
