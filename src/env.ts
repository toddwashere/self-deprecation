export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  ENVIRONMENT: "development" | "production";
  DEV_AUTH_BYPASS?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  ALLOWED_GITHUB_LOGINS?: string;
  OPENAI_API_KEY: string;
  ADZUNA_APP_ID: string;
  ADZUNA_APP_KEY: string;
  DECISIONS_ENABLED: string;
  DECISIONS_DAILY_JOB_CAP: string;
  DECISIONS_BATCH_SIZE: string;
  DECISIONS_CONCURRENCY: string;
  PUBLIC_BASE_URL: string;
}
