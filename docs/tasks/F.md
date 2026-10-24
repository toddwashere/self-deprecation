# F1 task brief — platform spike

## Approach

- Scaffold strict TypeScript for Cloudflare Workers with pinned dependencies, Biome, Vitest, and every npm script named in PLAN §15 (later-phase scripts may be explicit placeholders until their owners land).
- Use Cloudflare's current stateless Streamable HTTP path (`createMcpHandler` + MCP SDK v2); do not introduce a Durable Object for transport.
- Register one `ping` MCP App tool and one `ui://self-deprecation/hello` HTML resource. Advertise both `{ type: "thread" }` and `{ type: "global" }` through `_meta["openai/ui"].entrypoints`.
- Import and initialize the OpenAI extensions server SDK in the Worker so typecheck, bundle, local invocation, and production deployment test actual Workers compatibility.
- Create real D1 and KV resources, deploy to `workers.dev`, test the public `/mcp` endpoint, and record VERIFY findings plus fallback triggers in `docs/decisions-log.md`.

## Files

- Create/edit: `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `wrangler.jsonc`.
- Create/edit: `src/index.ts`, `src/env.ts`, `src/ping.test.ts`.
- Create/edit: `docs/tasks/F.md`, `docs/decisions-log.md`.

## Tool and panel contract

- `ping` input: `z.object({})`.
- `ping` structured output: `z.object({ status: z.literal("ok"), message: z.string() })`.
- Result text is a short model-readable connection confirmation; structured output drives the hello panel.
- Required annotations: read-only `true`, destructive `false`, open-world `false`; status strings remain at most 64 characters.
- Panel states: initial/loading copy while connecting, success from `structuredContent`, and a visible error fallback. Static F1 UI has no empty-data state.

## Tests and checks

- TDD contract test: list tools/resources through the real MCP handler; assert `ping` metadata, annotations, status, output schema/result, UI URI, entrypoints, and exact MCP App MIME type.
- Assert `GET /` health response, `/mcp` CORS preflight, and unknown-route `404`.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`; call local and deployed `ping` with an MCP client.

## Open questions

- `[local]` Transport: choose stateless `createMcpHandler`; current Cloudflare docs deprecate and feature-freeze `McpAgent` for new servers.
- `[local]` OpenAI SDK compatibility: prove by importing/initializing `@openai/mcp-extensions/server`, bundling for Workers, invoking locally, and deploying; fall back to protocol metadata only if the package itself is incompatible.
- `[local]` OAuth template: assess it against PLAN §9 now, but defer implementation to F2.
- No `[contract]` or `[product]` questions block F1.
