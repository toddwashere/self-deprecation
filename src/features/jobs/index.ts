import type { FeatureModule } from "../../mcp/types";
import { catalogTools } from "./catalog-tools";
import { jobsTools } from "./tools";

export const jobsFeature = {
  id: "jobs",
  tools: [...catalogTools, ...jobsTools],
} satisfies FeatureModule;
