export const SKILLS = [
  "ai",
  "aws",
  "cloudflare",
  "docker",
  "go",
  "javascript",
  "kubernetes",
  "llm",
  "node",
  "postgres",
  "python",
  "react",
  "rust",
  "typescript",
] as const;

export function extractSkills(text: string): string[] {
  const normalized = text.toLowerCase();
  return SKILLS.filter((skill) => new RegExp(`\\b${skill}\\b`, "i").test(normalized));
}
