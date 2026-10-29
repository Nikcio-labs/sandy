//! Public provider discovery. GitHub uses HTTPS APIs, never a local git/curl install.
//! Requests carry the user's GitHub token (Settings) when one is stored, and
//! are anonymous otherwise. Blocking entry points belong on Tauri's blocking
//! worker pool.
//!
//! Verified public interfaces:
//! - GitHub /repos/{owner}/{repo}/tags and /git/trees/{commit}?recursive=1.
//! - V2 OCI artifactType is application/vnd.docker.sandbox.kit.v2, with a
//!   application/vnd.docker.sandbox.kit.v2.spec+yaml config. V3 uses ordinary
//!   image manifests with vnd.docker.sandbox.kit.descriptor annotations.
//! - sbx kit inspect REFERENCE --json currently normalizes v3 workload to
//!   kind=sandbox; raw authored v3 descriptors have kind=workload and no name.

mod cache;
mod descriptor;
mod github;
mod http;
mod settings;
mod store;
mod types;

// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;

pub use settings::{get_github_token, save_github_token};
pub use store::{get_providers, save_providers};
pub(crate) use store::{github_repository, unique_id, write_json};
#[cfg(test)]
pub use types::KitArgument;
pub use types::{Catalog, KitOption, Provider};

use std::path::Path;

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

/// Cached-first version list for one provider. Without `refresh` the network
/// is never touched: a cached list for this exact provider configuration is
/// served as-is, and only a miss (never fetched, providers changed) fetches
/// live — and then stores the result.
pub fn provider_versions(
    root: &Path,
    provider: Provider,
    refresh: bool,
) -> Result<Vec<String>, String> {
    validate_provider(&provider)?;
    if !refresh && let Some(values) = cache::read_versions(root, &provider) {
        return Ok(values);
    }
    let values = versions_with(&api_with_token(root)?, &provider)?;
    cache::write_versions(root, &provider, &values);
    Ok(values)
}

/// `Api` is cheap to build; the token is read per call so a save or clear in
/// the UI takes effect on the next discovery without a restart.
fn api_with_token(root: &std::path::Path) -> Result<Api, String> {
    let mut api = Api::public()?;
    api.token = get_github_token(root)?;
    Ok(api)
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

/// Cache-first: when a discovery result is cached for this exact provider
/// configuration, it is served and the network is never touched. `refresh`
/// bypasses the cache (and updates it). A cache miss fetches live and stores
/// the result, so GitHub is called at most once per configuration change.
pub fn discover_kits(
    root: &Path,
    providers: Vec<Provider>,
    refresh: bool,
) -> Result<Catalog, String> {
    // Validate before the cache lookup: an invalid configuration is an error
    // even when a cached result exists for it.
    for provider in &providers {
        validate_provider(provider)?;
    }
    if !refresh && let Some(cached) = cache::read_catalog(root, &providers) {
        return Ok(cached);
    }
    let mut catalog = discover_with(&api_with_token(root)?, &providers)?;
    // The built-ins are documented v2 shortcuts, not guessed registry
    // repositories. They must be merged before caching: a cache hit has to
    // return the same catalog a fresh discovery would, otherwise the frontend
    // would keep flagging the built-ins as unverified on every discovery.
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
    cache::write_catalog(root, &providers, &catalog);
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
