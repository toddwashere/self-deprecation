import { describe, expect, it } from "vitest";
import { resolveUserId } from "./guards";

describe("F2 auth guards", () => {
  it("refuses the development bypass in production", () => {
    expect(() =>
      resolveUserId({ ENVIRONMENT: "production", DEV_AUTH_BYPASS: "1" }, undefined, {
        userId: "forged-user",
      }),
    ).toThrow("DEV_AUTH_BYPASS cannot run in production");
  });

  it("takes the user id only from verified OAuth props", () => {
    expect(
      resolveUserId(
        { ENVIRONMENT: "production" },
        { userId: "verified-user" },
        { userId: "forged-user" },
      ),
    ).toBe("verified-user");

    expect(() =>
      resolveUserId({ ENVIRONMENT: "production" }, undefined, { userId: "forged-user" }),
    ).toThrow("Authentication required");
  });

  it("uses a fixed local identity only in development", () => {
    expect(resolveUserId({ ENVIRONMENT: "development", DEV_AUTH_BYPASS: "1" }, undefined)).toBe(
      "dev-user",
    );
  });
});
