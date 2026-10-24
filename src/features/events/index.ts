import type { FeatureModule } from "../../mcp/types";
import { eventsTools } from "./tools";

export const eventsFeature = { id: "events", tools: eventsTools } satisfies FeatureModule;
