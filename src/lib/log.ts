export type SafeLogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(event: string, fields?: SafeLogFields): void;
  warn(event: string, fields?: SafeLogFields): void;
  error(event: string, fields?: SafeLogFields): void;
}

const forbiddenFields = /body|email|note|resume|secret|text|token/i;

function sanitize(fields: SafeLogFields = {}): SafeLogFields {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !forbiddenFields.test(key)));
}

export function createLogger(scope: string): Logger {
  const write = (level: "info" | "warn" | "error", event: string, fields?: SafeLogFields) => {
    console[level](JSON.stringify({ level, scope, event, ...sanitize(fields) }));
  };
  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}
