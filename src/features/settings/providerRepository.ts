export function normalizeRepository(value: string): string {
  return value
    .trim()
    .replace(/\/+$/, "")
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/, "");
}

export function repositoryIsValid(value: string) {
  return /^[\w.-]+\/[\w.-]+$/.test(normalizeRepository(value));
}
