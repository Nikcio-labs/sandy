//! Catalog settings persistence: a small settings.json next to providers.json.
//! Missing fields (or a missing file) fall back to the built-in defaults, so
//! older configurations keep working without migration.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::write_json;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogSettings {
    /// Refs and tags come from git smart-HTTP (github.com) instead of the
    /// REST API (api.github.com), whose anonymous quota is 60 req/hour. Git
    /// is on by default because listing tags there costs no REST quota.
    #[serde(default = "default_true")]
    pub discovery_use_git_protocol: bool,
}

impl Default for CatalogSettings {
    fn default() -> Self {
        Self {
            discovery_use_git_protocol: default_true(),
        }
    }
}

fn settings_path(root: &Path) -> std::path::PathBuf {
    root.join("settings.json")
}

pub fn get_catalog_settings(root: &Path) -> Result<CatalogSettings, String> {
    let path = settings_path(root);
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| format!("Cannot read {}: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(CatalogSettings::default()),
        Err(e) => Err(format!("Cannot read {}: {e}", path.display())),
    }
}

pub fn save_catalog_settings(
    root: &Path,
    settings: CatalogSettings,
) -> Result<CatalogSettings, String> {
    write_json(&settings_path(root), &settings)?;
    Ok(settings)
}

/// The single setting discovery needs; a missing file means the default (on).
pub(crate) fn get_discovery_use_git_protocol(root: &Path) -> Result<bool, String> {
    Ok(get_catalog_settings(root)?.discovery_use_git_protocol)
}
