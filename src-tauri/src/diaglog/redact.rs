//! Credential masking applied to every record before it reaches the log
//! file: because redaction happens at write time, no read surface — the
//! in-app viewer, the on-disk file, or a copy of either — can see a secret
//! the app logged.
//!
//! Each pattern is kept narrow (long, prefix-anchored, or key-labelled) so
//! ordinary CLI output — URLs, hashes, image digests — is not mangled.

use regex::Regex;
use std::sync::OnceLock;

const REDACTED: &str = "[redacted]";

type Rule = (Regex, &'static str);

const RULE_PATTERNS: &[(&str, &str)] = &[
    // GitHub personal access / OAuth / server / refresh tokens.
    (r"\bgh[oprsu]_[A-Za-z0-9]{20,}\b", REDACTED),
    (r"\bgithub_pat_[A-Za-z0-9_.]{20,}", REDACTED),
    // Docker personal access tokens.
    (r"\bdckr_pat_[A-Za-z0-9_-]{20,}", REDACTED),
    // AWS access key IDs (secret keys have no fixed prefix and are covered
    // by the key=value rule when they appear labelled).
    (r"\bAKIA[0-9A-Z]{16}\b", REDACTED),
    // JWTs: three base64url segments starting with the standard header prefix.
    (
        r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
        REDACTED,
    ),
    // Authorization header values, including "Bearer <token>" and
    // "Basic <creds>" scheme+token pairs; redact the whole header value.
    (r"(?i)\b(authorization)\s*:\s*[^\r\n]*", "$1: [redacted]"),
    (r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}", "$1 [redacted]"),
    // Labelled credentials in URLs and command output: token=..., secret=...,
    // password=... — with `=` or `:` separators and optional surrounding
    // quotes. Compound labels share the same word characters as the label
    // itself (access_token, client_secret), so they need an explicit prefix
    // match. A minimum value length keeps short ordinary words intact.
    (
        r#"(?i)\b([A-Za-z0-9]+_)?(token|secret|password)(\s*[=:]\s*)(["']?)([^\s"'&]{6,})"#,
        "$1$2$3$4[redacted]",
    ),
];

fn rules() -> &'static Vec<Rule> {
    static RULES: OnceLock<Vec<Rule>> = OnceLock::new();
    RULES.get_or_init(|| {
        RULE_PATTERNS
            .iter()
            .filter_map(|(pattern, replacement)| {
                // A malformed static pattern is caught by the unit tests;
                // dropping it keeps logging alive rather than panicking
                // mid-record.
                Regex::new(pattern).ok().map(|regex| (regex, *replacement))
            })
            .collect()
    })
}

pub(super) fn redact(text: &str) -> String {
    let mut result = text.to_string();
    for (regex, replacement) in rules() {
        result = regex.replace_all(&result, *replacement).into_owned();
    }
    result
}

// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::redact;

    #[test]
    fn credential_prefixes_are_masked() {
        assert_eq!(
            redact("auth failed for ghp_0123456789abcdefghij"),
            "auth failed for [redacted]"
        );
        assert_eq!(
            redact("pull github_pat_ABCDEFGHIJKLMNOPQRST."),
            "pull [redacted]"
        );
        assert_eq!(
            redact("login dckr_pat_0123456789abcdefghij"),
            "login [redacted]"
        );
        assert_eq!(redact("key AKIAIOSFODNN7EXAMPLE"), "key [redacted]");
    }

    #[test]
    fn jwt_and_auth_headers_are_masked() {
        let jwt =
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        assert_eq!(redact(jwt), "[redacted]");
        assert_eq!(
            redact("Authorization: Bearer abcdefghijklmnop"),
            "Authorization: [redacted]"
        );
        assert_eq!(redact("Bearer abcdefghij"), "Bearer [redacted]");
        // The header rule consumes the rest of the line, so a following
        // line's labelled secret is only masked by its own rule.
        assert_eq!(
            redact("authorization: Basic dXNlcjpwYXNz\ntoken=abcdefgh"),
            "authorization: [redacted]\ntoken=[redacted]"
        );
    }

    #[test]
    fn labelled_secrets_are_masked_including_compound_labels() {
        assert_eq!(redact("token=abcdefgh"), "token=[redacted]");
        assert_eq!(
            redact("client_secret: hunter22"),
            "client_secret: [redacted]"
        );
        assert_eq!(
            redact("access_token = \"abcdefgh\""),
            "access_token = \"[redacted]\""
        );
        assert_eq!(
            redact("https://registry.example/v2/?token=abcdefgh&scope=repo"),
            "https://registry.example/v2/?token=[redacted]&scope=repo"
        );
    }

    #[test]
    fn ordinary_output_is_not_mangled() {
        assert_eq!(redact("sbx ls --format json"), "sbx ls --format json");
        assert_eq!(
            redact("sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        );
        assert_eq!(
            redact("GET https://hub.docker.com/v2/repositories/library/nginx"),
            "GET https://hub.docker.com/v2/repositories/library/nginx"
        );
        // The minimum length keeps short ordinary words intact.
        assert_eq!(redact("token=abc"), "token=abc");
    }
}
