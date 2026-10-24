import type { FeatureModule } from "../../mcp/types";
import { newsTools } from "./tools";
export const newsFeature = { id: "news", tools: newsTools } satisfies FeatureModule;
