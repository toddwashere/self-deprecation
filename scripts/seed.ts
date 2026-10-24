const response = await fetch("http://localhost:8787/mcp", {
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-11-25",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "load_demo_data", arguments: {} },
  }),
});

if (!response.ok) {
  throw new Error(
    `Local MCP seed failed (${response.status}). Start npm run dev with DEV_AUTH_BYPASS=1.`,
  );
}
console.log(await response.text());
