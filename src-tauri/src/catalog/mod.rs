//! Public provider discovery. GitHub uses HTTPS APIs, never a local git/curl install.
//! Blocking entry points belong on Tauri's blocking worker pool.
//!
//! Verified public interfaces:
//! - GitHub /repos/{owner}/{repo}/tags and /git/trees/{commit}?recursive=1.
//! - V2 OCI artifactType is application/vnd.docker.sandbox.kit.v2, with a
//!   application/vnd.docker.sandbox.kit.v2.spec+yaml config. V3 uses ordinary
//!   image manifests with vnd.docker.sandbox.kit.descriptor annotations.
//! - sbx kit inspect REFERENCE --json currently normalizes v3 workload to
//!   kind=sandbox; raw authored v3 descriptors have kind=workload and no name.

mod descriptor;
mod github;
mod http;
mod store;
mod types;

// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;

pub use store::{get_providers, save_providers};
pub(crate) use store::{github_repository, unique_id, write_json};
#[cfg(test)]
pub use types::KitArgument;
pub use types::{Catalog, KitOption, Provider};

use self::github::discover_github;
use self::http::Api;
use self::store::validate_provider;

/// The built-in agents as documented on
/// <https://docs.docker.com/ai/sandboxes/agents/>.
pub(crate) const BUILTIN_AGENTS: &[&str] = &[
    "claude",
    "codex",
    "copilot",
    "cursor",
    "devin",
    "docker-agent",
    "droid",
    "gemini",
    "kiro",
    "opencode",
    "shell",
];

pub fn provider_versions(provider: Provider) -> Result<Vec<String>, String> {
    versions_with(&Api::public()?, &provider)
}

fn versions_with(api: &Api, provider: &Provider) -> Result<Vec<String>, String> {
    validate_provider(provider)?;
    let repository = github_repository(&provider.repository)?;
    let values = api.github_tags(&repository)?;
    Ok(values
        .iter()
        .filter_map(|v| v["name"].as_str().map(String::from))
        .collect())
}

/// `query` is accepted for IPC compatibility; GitHub repositories and installed
/// built-ins are returned in full, and the frontend can filter their metadata.
pub fn discover_kits(providers: Vec<Provider>, _query: Option<String>) -> Result<Catalog, String> {
    let mut catalog = discover_with(&Api::public()?, &providers)?;
    // The built-ins are documented v2 shortcuts, not guessed registry repositories.
    for name in BUILTIN_AGENTS {
        let description = format!("Built-in {name} agent (v2)");
        catalog.kits.push(KitOption {
            id: format!("builtin:{name}"),
            name: (*name).into(),
            description,
            source: (*name).into(),
            schema_version: 2,
            kind: "agent".into(),
            provider_id: "builtin".into(),
            required_agent: None,
            arguments: Vec::new(),
        });
    }
    Ok(catalog)
}

fn discover_with(api: &Api, providers: &[Provider]) -> Result<Catalog, String> {
    let mut catalog = Catalog::default();
    for provider in providers.iter().filter(|p| p.enabled) {
        let result = validate_provider(provider).and_then(|_| match provider.kind.as_str() {
            "github" => discover_github(api, provider),
            other => Err(format!("Unsupported provider kind: {other}")),
        });
        match result {
            Ok(mut found) => {
                catalog.kits.append(&mut found.kits);
                catalog.warnings.append(&mut found.warnings);
            }
            Err(error) => catalog
                .warnings
                .push(format!("{}: {error}", provider.label)),
        }
    }
    catalog
        .kits
        .sort_by(|a, b| (&a.kind, &a.name, &a.source).cmp(&(&b.kind, &b.name, &b.source)));
    catalog.kits.dedup_by(|a, b| a.id == b.id);
    Ok(catalog)
}

fn repository_name(repository: &str) -> Option<&str> {
    repository.rsplit('/').next().filter(|s| !s.is_empty())
}

fn encoded(value: &str) -> String {
    // Form encoding is also the documented encoding of the Git fragment's ref/dir pairs.
    // The URL is a compile-time constant, so parse/query can't actually fail;
    // fall back to the raw value (safe, just unencoded) if it somehow did.
    reqwest::Url::parse_with_params("https://sandy.invalid", &[("v", value)])
        .map(|url| {
            url.query()
                .unwrap_or_default()
                .trim_start_matches("v=")
                .to_string()
        })
        .unwrap_or_else(|_| value.to_string())
}

fn encoded_path(value: &str) -> String {
    encoded(value).replace('+', "%20")
}

const MAX_BODY: u64 = 12 * 1024 * 1024;
const METADATA_BATCH: usize = 4;
