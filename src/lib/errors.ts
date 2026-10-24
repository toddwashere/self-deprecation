export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
