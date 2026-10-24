export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  ENVIRONMENT: "development" | "production";
  DECISIONS_ENABLED: string;
  DECISIONS_DAILY_JOB_CAP: string;
  DECISIONS_BATCH_SIZE: string;
  DECISIONS_CONCURRENCY: string;
  PUBLIC_BASE_URL: string;
}
