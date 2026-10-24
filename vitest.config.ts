import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ENVIRONMENT: "development",
          DEV_AUTH_BYPASS: "1",
          PUBLIC_BASE_URL: "http://localhost",
        },
      },
    }),
  ],
});
