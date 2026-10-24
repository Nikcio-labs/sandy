const REDACTED = "[redacted]";

// The clipboard leaves the app, unlike the in-app log view and the on-disk
// file, so anything that even resembles a credential is masked before copy.
// Each pattern is kept narrow (long, prefix-anchored, or key-labelled) so
// ordinary CLI output — URLs, hashes, image digests — is not mangled.
const RULES: Array<[RegExp, string]> = [
  // GitHub personal access / OAuth / server / refresh tokens.
  [/\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_.]{20,}/g, REDACTED],
  // Docker personal access tokens.
  [/\bdckr_pat_[A-Za-z0-9_-]{20,}/g, REDACTED],
  // AWS access key IDs (secret keys have no fixed prefix and are covered by
  // the key=value rule when they appear labelled).
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  // JWTs: three base64url segments starting with the standard header prefix.
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  // Authorization header values, including "Bearer <token>" and
  // "Basic <creds>" scheme+token pairs; redact the whole header line value.
  [/\b(authorization)\s*:\s*[^\r\n]*/gi, `$1: ${REDACTED}`],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // Labelled credentials in URLs and command output: token=..., secret=...,
  // password=... — with `=` or `:` separators and optional surrounding
  // quotes. A minimum value length keeps short ordinary words intact.
  [/\b(token|secret|password)(\s*[=:]\s*)(["']?)([^\s"'&]{6,})/gi, `$1$2$3${REDACTED}`],
  // Compound labels share the same word characters as the label itself
  // (access_token, client_secret), so they need an explicit prefix match.
  [/\b([A-Za-z0-9]+_)?(token|secret|password)(\s*[=:]\s*)(["']?)([^\s"'&]{6,})/gi, `$1$2$3$4${REDACTED}`],
];

/**
 * Masks token-like substrings (credential prefixes, JWTs, auth headers,
 * labelled secrets) with a fixed placeholder while leaving the rest of the
 * text — and its line structure — intact.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
