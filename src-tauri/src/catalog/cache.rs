//! Persistent discovery cache: catalogs and version lists keyed by the
//! provider configuration that produced them, stored in the app data dir.
//!
//! Policy: cache-first. Discovery and version fetches serve the cached
//! result whenever one exists for the current configuration and never touch
//! the network; callers must pass `refresh` to bypass it. This keeps GitHub
//! out of the loop entirely until the user asks for fresh data.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri_plugin_log::log;

use super::types::{Catalog, Provider};
use super::write_json;

/// Cache files live in their own directory, matching the `templates/`
/// precedent for app-data subdirectories.
fn cache_dir(root: &Path) -> PathBuf {
    root.join("cache")
}

fn catalog_path(root: &Path) -> PathBuf {
    cache_dir(root).join("catalog.json")
}

fn versions_path(root: &Path) -> PathBuf {
    cache_dir(root).join("versions.json")
}

/// A stable fingerprint of the provider configuration: the cache must only
/// serve results that were produced by exactly this configuration.
fn fingerprint(providers: &[Provider]) -> String {
    // The Provider fields are plain strings/bools, so the JSON round-trip is
    // deterministic; vector order is under the caller's control.
    serde_json::to_string(providers).unwrap_or_default()
}

/// A cached payload plus the configuration fingerprint that produced it. A
/// fingerprint mismatch (providers edited) is a miss even when the file
/// exists.
#[derive(Serialize, Deserialize)]
struct Cached<T> {
    fingerprint: String,
    fetched_at: String,
    value: T,
}

/// The cached catalog for this exact provider configuration, if any.
pub fn read_catalog(root: &Path, providers: &[Provider]) -> Option<Catalog> {
    read_cached(&catalog_path(root), &fingerprint(providers))
}

/// Store a discovery result under the producing configuration's fingerprint.
pub fn write_catalog(root: &Path, providers: &[Provider], catalog: &Catalog) {
    let cached = Cached {
        fingerprint: fingerprint(providers),
        fetched_at: crate::logging::now_rfc3339(),
        value: catalog,
    };
    if let Err(error) = write_json(&catalog_path(root), &cached) {
        log::error!(target: "app", "Cannot write the discovery cache: {error}");
    }
}

/// A per-provider version list keyed by provider identity, so unrelated
/// providers' cached lists can coexist in one file.
#[derive(Serialize, Deserialize, Default)]
struct VersionCache {
    entries: Vec<CachedVersion>,
}

#[derive(Serialize, Deserialize)]
struct CachedVersion {
    key: String,
    fingerprint: String,
    fetched_at: String,
    values: Vec<String>,
}

fn version_key(provider: &Provider) -> String {
    format!("{}:{}:{}", provider.kind, provider.repository, provider.id)
}

/// The cached version list for this exact provider, if any.
pub fn read_versions(root: &Path, provider: &Provider) -> Option<Vec<String>> {
    let bytes = std::fs::read(versions_path(root)).ok()?;
    let cache: VersionCache = serde_json::from_slice(&bytes).ok()?;
    let fingerprint = fingerprint(std::slice::from_ref(provider));
    cache
        .entries
        .iter()
        .find(|entry| entry.key == version_key(provider) && entry.fingerprint == fingerprint)
        .map(|entry| entry.values.clone())
}

/// Store a version list for one provider, replacing the entry with the same key.
pub fn write_versions(root: &Path, provider: &Provider, values: &[String]) {
    let mut cache: VersionCache = std::fs::read(versions_path(root))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    let key = version_key(provider);
    cache.entries.retain(|entry| entry.key != key);
    cache.entries.push(CachedVersion {
        key,
        fingerprint: fingerprint(std::slice::from_ref(provider)),
        fetched_at: crate::logging::now_rfc3339(),
        values: values.to_vec(),
    });
    if let Err(error) = write_json(&versions_path(root), &cache) {
        log::error!(target: "app", "Cannot write the version cache: {error}");
    }
}

fn read_cached<T: for<'de> Deserialize<'de>>(path: &Path, fingerprint: &str) -> Option<T> {
    let bytes = std::fs::read(path).ok()?;
    // A cache we cannot parse is as good as absent; the next successful
    // refresh rewrites it.
    match serde_json::from_slice::<Cached<T>>(&bytes) {
        Ok(cached) if cached.fingerprint == fingerprint => Some(cached.value),
        _ => None,
    }
}
