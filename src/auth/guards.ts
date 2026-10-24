import type { AuthEnvironment, AuthProps } from "./types";

export function resolveUserId(
  env: AuthEnvironment,
  props?: Pick<AuthProps, "userId">,
  _untrustedArguments?: unknown,
): string {
  if (env.DEV_AUTH_BYPASS === "1") {
    if (env.ENVIRONMENT === "production") {
      throw new Error("DEV_AUTH_BYPASS cannot run in production");
    }
    return "dev-user";
  }

  if (!props?.userId) {
    throw new Error("Authentication required");
  }
  return props.userId;
}

export function localAuthProps(userId: string): AuthProps {
  return { userId, name: "Local Developer", nickname: "dev" };
}
