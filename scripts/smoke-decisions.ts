import demo from "../seed/demo-todd.json" with { type: "json" };
import jobs from "../seed/jobs-snapshot.json" with { type: "json" };
import { smokeScoreBatch } from "../src/lib/decisions";

process.loadEnvFile(".dev.vars");
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is missing from .dev.vars");

const results = await smokeScoreBatch(apiKey, JSON.stringify(demo.profile), jobs);
console.table(
  results.map(({ jobId, score, source, confidence }) => ({ jobId, score, source, confidence })),
);

const ranked = [...results].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
if (!ranked[0]?.jobId.includes("ai") && !ranked[0]?.jobId.includes("senior")) {
  throw new Error(`Unexpected top result: ${ranked[0]?.jobId ?? "none"}`);
}
