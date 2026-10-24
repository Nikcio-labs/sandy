//! Public provider discovery. GitHub kit descriptors are fetched over plain
//! HTTPS with no local git/curl install; when the git-protocol setting is on,
//! refs and tags are read through the git smart-HTTP protocol spoken by the
//! shared HTTP client (no `git` binary, no packfiles). Blocking entry points
//! belong on Tauri's blocking worker pool.
//!
//! Verified public interfaces:
//! - GitHub /info/refs?service=git-upload-pack (git smart-HTTP v0, github.com)
//!   when the git-protocol setting is on; /repos/{owner}/{repo}/tags (REST)
//!   when off. The repository tree always uses /git/trees/{commit}?recursive=1.
//! - V2 OCI artifactType is application/vnd.docker.sandbox.kit.v2, with a
//!   application/vnd.docker.sandbox.kit.v2.spec+yaml config. V3 uses ordinary
//!   image manifests with vnd.docker.sandbox.kit.descriptor annotations.
//! - sbx kit inspect REFERENCE --json currently normalizes v3 workload to
//!   kind=sandbox; raw authored v3 descriptors have kind=workload and no name.

mod cache;
mod descriptor;
mod git;
mod github;
mod http;
mod settings;
mod store;
mod types;

// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;

pub(crate) use settings::get_discovery_use_git_protocol;
pub use settings::{CatalogSettings, get_catalog_settings, save_catalog_settings};
pub use store::{get_providers, save_providers};
pub(crate) use store::{github_repository, unique_id, write_json};
#[cfg(test)]
pub use types::KitArgument;
pub use types::{Catalog, KitOption, Provider};

use std::path::Path;

use self::github::discover_github;
use self::http::Api;
use self::store::validate_provider;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GitMode {
    /// Refs and tags via git smart-HTTP (github.com, lenient rate domain).
    Git,
    /// Refs and tags via the REST API (api.github.com, 60 req/hour anonymous).
    Rest,
}

impl GitMode {
    pub(crate) fn from_setting(use_git_protocol: bool) -> Self {
        if use_git_protocol {
            Self::Git
        } else {
            Self::Rest
        }
    }
}

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
    let mode = GitMode::from_setting(get_discovery_use_git_protocol(root)?);
    let values = versions_with(&Api::public()?, mode, &provider)?;
    cache::write_versions(root, &provider, &values);
    Ok(values)
}

fn versions_with(api: &Api, mode: GitMode, provider: &Provider) -> Result<Vec<String>, String> {
    validate_provider(provider)?;
    let repository = github_repository(&provider.repository)?;
    let names = match mode {
        GitMode::Git => api.git_refs(&repository)?.tag_names(),
        GitMode::Rest => api
            .github_tags(&repository)?
            .iter()
            .filter_map(|v| v["name"].as_str().map(String::from))
            .collect(),
    };
    Ok(names)
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
    let mode = GitMode::from_setting(get_discovery_use_git_protocol(root)?);
    let mut catalog = discover_with(&Api::public()?, mode, &providers)?;
    cache::write_catalog(root, &providers, &catalog);
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

fn discover_with(api: &Api, mode: GitMode, providers: &[Provider]) -> Result<Catalog, String> {
    let mut catalog = Catalog::default();
    for provider in providers.iter().filter(|p| p.enabled) {
        let result = validate_provider(provider).and_then(|_| match provider.kind.as_str() {
            "github" => discover_github(api, mode, provider),
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
