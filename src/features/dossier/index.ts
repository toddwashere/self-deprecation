import type { FeatureModule } from "../../mcp/types";
import { dossierTools } from "./tools";

export const dossierFeature = { id: "dossier", tools: dossierTools } satisfies FeatureModule;
