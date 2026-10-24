export function needsAuth(resourceMetadataUrl: string) {
  const challenge = `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="Sign in to continue"`;
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: "Sign in to Self-Deprecation to continue." }],
    _meta: { "mcp/www_authenticate": challenge },
  };
}
