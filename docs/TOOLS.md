# Tool catalog

All tools use OAuth scope `mcp:read`. Tool handlers receive the internal user ID only from verified
OAuth grant props (or the guarded local development identity). Structured result schemas are the
server/panel contract.

| Tool | Feature | Effect | Opens panel | Purpose |
|---|---|---:|---:|---|
| `ping` | core | read-only | yes | Verify the MCP connection and UI resource. |
| `get_profile` | core | read-only | no | Return the verified signed-in identity. |
| `get_task_status` | core | read-only | no | Poll a long-running task owned by the caller. |

Feature folders are predeclared in `src/mcp/registry.ts`. Adding a tool to a feature's exported
`tools` array registers it automatically with annotations, status text, OAuth metadata, and optional
panel metadata.

## Known gaps

- The F4 panel resource is still the connection placeholder. F5 replaces it with the embedded React
  shell.
- Core Reset and Load Demo tools arrive in F6.
