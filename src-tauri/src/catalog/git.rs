//! Git smart-HTTP (v0) ref discovery for GitHub providers, spoken directly
//! over HTTPS with no local git install and no packfile support. Tags and
//! branches listed here draw on github.com's lenient rate domain instead of
//! the anonymous api.github.com quota (60 req/hour); only the repository
//! tree (REST) and descriptor contents (raw.githubusercontent.com) are
//! still fetched elsewhere.

use std::cmp::Ordering;

/// A parsed `info/refs?service=git-upload-pack` (v0) advertisement.
#[derive(Debug, Default)]
pub(super) struct GitRefs {
    /// Newest first: natural version order, advertisement order for ties.
    tags: Vec<GitTag>,
    /// `(full refname, sha)` in advertisement order.
    heads: Vec<(String, String)>,
    head: Option<String>,
    /// Full refname advertised as `symref=HEAD:...`, used when the server
    /// does not send a HEAD ref line of its own.
    default_branch: Option<String>,
}

#[derive(Debug)]
struct GitTag {
    /// Full refname, e.g. `refs/tags/v1.0`.
    name: String,
    sha: String,
    /// Commit behind an annotated tag (the `^{}` peeled line); lightweight
    /// tags have none and point at their commit directly.
    peeled: Option<String>,
}

impl GitTag {
    fn commit(&self) -> String {
        self.peeled.clone().unwrap_or_else(|| self.sha.clone())
    }
}

impl GitRefs {
    /// Tag names without the `refs/tags/` prefix, newest first.
    pub(super) fn tag_names(&self) -> Vec<String> {
        self.tags
            .iter()
            .map(|tag| tag.name.trim_start_matches("refs/tags/").to_string())
            .collect()
    }

    /// The commit discovery starts from when no reference is chosen: the
    /// newest tag, else the default branch, matching the REST endpoint's
    /// behavior.
    pub(super) fn latest_commit(&self) -> Result<String, String> {
        self.tags
            .first()
            .map(|tag| tag.commit())
            .or_else(|| self.head_commit())
            .ok_or_else(|| "GitHub repository has no tags or branches to discover".into())
    }

    fn head_commit(&self) -> Option<String> {
        // Resolve through the symref'd branch when advertised; the raw HEAD
        // line is the fallback for servers that omit the capability.
        self.default_branch
            .as_deref()
            .and_then(|branch| {
                self.heads
                    .iter()
                    .find(|(name, _)| name == branch)
                    .map(|(_, sha)| sha.clone())
            })
            .or_else(|| self.head.clone())
    }

    /// Resolve a manual tag, branch, full refname, or commit SHA against
    /// the advertisement. Short SHAs (6–39 hex chars) prefix-match the
    /// advertised tag/peel/HEAD SHAs — the REST commit endpoint accepted
    /// them, so saved references must keep resolving after a mode switch.
    pub(super) fn resolve(&self, reference: &str) -> Result<String, String> {
        if is_commit_sha(reference) {
            return Ok(reference.to_string());
        }
        let candidates = [
            reference.to_string(),
            format!("refs/tags/{reference}"),
            format!("refs/heads/{reference}"),
        ];
        for candidate in candidates {
            if let Some(tag) = self.tags.iter().find(|tag| tag.name == candidate) {
                return Ok(tag.commit());
            }
            if let Some((_, sha)) = self.heads.iter().find(|(name, _)| *name == candidate) {
                return Ok(sha.clone());
            }
        }
        if let Some(sha) = self.resolve_short_sha(reference) {
            return Ok(sha);
        }
        Err("GitHub could not resolve the selected reference to a commit".into())
    }

    /// Unique advertised SHA starting with the given short prefix; a prefix
    /// matching several distinct commits is refused rather than guessed.
    fn resolve_short_sha(&self, reference: &str) -> Option<String> {
        if reference.len() < 6 || !reference.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let mut unique: Option<String> = None;
        let candidates = || {
            self.tags
                .iter()
                .flat_map(|tag| {
                    let peeled = tag.peeled.as_deref();
                    [Some(tag.sha.as_str()), peeled]
                })
                .flatten()
                .chain(self.head.iter().map(|sha| sha.as_str()))
                .chain(self.heads.iter().map(|(_, sha)| sha.as_str()))
        };
        for sha in candidates().filter(|sha| sha.starts_with(reference)) {
            if unique.is_some() && unique.as_deref() != Some(sha) {
                return None;
            }
            unique = Some(sha.to_string());
        }
        unique
    }
}

fn is_commit_sha(reference: &str) -> bool {
    reference.len() == 40 && reference.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Parse a v0 smart-HTTP ref advertisement: the `# service=` preamble,
/// capability suffixes on the first line (`\0symref=HEAD:...`), and the
/// `^{}` peeled lines that give annotated tags their commit.
pub(super) fn parse_ref_advertisement(body: &str) -> Result<GitRefs, String> {
    let mut refs = GitRefs::default();
    for payload in pkt_lines(body) {
        let payload = payload.trim_end_matches('\n');
        if payload.is_empty() || payload.starts_with('#') {
            continue;
        }
        if let Some(message) = payload.strip_prefix("ERR ") {
            return Err(message.to_string());
        }
        let (entry, capabilities) = payload.split_once('\0').unwrap_or((payload, ""));
        let Some((sha, name)) = entry.split_once(' ') else {
            return Err(format!("malformed ref line: {payload}"));
        };
        // An all-zero HEAD is an unborn branch (empty repository), not a
        // commit the tree endpoint can serve.
        if name == "HEAD" && sha.bytes().any(|b| b != b'0') {
            refs.head = Some(sha.to_string());
        }
        if let Some(target) = symref_head(capabilities) {
            refs.default_branch = Some(target.to_string());
        }
        if let Some(name) = name.strip_suffix("^{}") {
            if let Some(tag) = refs.tags.iter_mut().rev().find(|tag| tag.name == name) {
                tag.peeled = Some(sha.to_string());
            }
        } else if name.starts_with("refs/tags/") {
            refs.tags.push(GitTag {
                name: name.to_string(),
                sha: sha.to_string(),
                peeled: None,
            });
        } else if name.starts_with("refs/heads/") {
            refs.heads.push((name.to_string(), sha.to_string()));
        }
    }
    if refs.tags.is_empty() && refs.heads.is_empty() && refs.head.is_none() {
        return Err("no refs were advertised".into());
    }
    // Discovery treats the first tag as "latest"; the advertisement arrives
    // ASCII-ordered, so sort by version naturally (v10 after v2) and let the
    // stable sort keep advertisement order for the rest.
    refs.tags.sort_by(|a, b| natural_cmp(&b.name, &a.name));
    Ok(refs)
}

fn symref_head(capabilities: &str) -> Option<&str> {
    capabilities
        .split_whitespace()
        .find_map(|cap| cap.strip_prefix("symref=HEAD:"))
}

/// Iterate pkt-line payloads. A flush packet (`0000`) yields an empty
/// payload; non-hex, inverted, or truncated framing ends the stream — the
/// body is untrusted network input, so any anomaly must stop iteration
/// rather than slice out of bounds.
fn pkt_lines(body: &str) -> impl Iterator<Item = &str> {
    let mut rest = body;
    std::iter::from_fn(move || {
        if rest.len() < 4 || !rest.as_bytes()[..4].iter().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let Ok(len) = usize::from_str_radix(&rest[..4], 16) else {
            return None;
        };
        if len == 0 {
            rest = &rest[4..];
            return Some("");
        }
        if len < 4 || rest.len() < len {
            return None;
        }
        let payload = &rest[4..len];
        rest = &rest[len..];
        Some(payload)
    })
}

/// Natural ordering: digit runs compare numerically so v10 sorts after v2;
/// other bytes compare as-is.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a.as_bytes(), b.as_bytes());
    loop {
        match (a.first(), b.first()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(&x), Some(&y)) => {
                if x.is_ascii_digit() && y.is_ascii_digit() {
                    let (x_value, x_rest) = leading_number(a);
                    let (y_value, y_rest) = leading_number(b);
                    if x_value != y_value {
                        return x_value.cmp(&y_value);
                    }
                    a = x_rest;
                    b = y_rest;
                } else if x == y {
                    a = &a[1..];
                    b = &b[1..];
                } else {
                    return x.cmp(&y);
                }
            }
        }
    }
}

fn leading_number(bytes: &[u8]) -> (u64, &[u8]) {
    let end = bytes
        .iter()
        .position(|b| !b.is_ascii_digit())
        .unwrap_or(bytes.len());
    let value = std::str::from_utf8(&bytes[..end])
        .ok()
        .and_then(|digits| digits.parse().ok())
        .unwrap_or(u64::MAX);
    (value, &bytes[end..])
}
