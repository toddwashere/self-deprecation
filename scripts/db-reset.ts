import { execFileSync } from "node:child_process";

const tables = [
  "api_usage",
  "ladder_quests",
  "ladder_assessments",
  "user_state",
  "saved_events",
  "notes",
  "contacts",
  "job_matches",
  "fetch_runs",
  "news_items",
  "jobs",
  "profiles",
  "auth_identities",
  "users",
  "d1_migrations",
];

const dropSql = [
  "PRAGMA foreign_keys = OFF",
  ...tables.map((table) => `DROP TABLE IF EXISTS ${table}`),
].join("; ");

execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", dropSql], {
  stdio: "inherit",
});
execFileSync("npm", ["run", "db:migrate:local"], { stdio: "inherit" });
