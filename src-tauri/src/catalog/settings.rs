//! App settings persistence (`settings.json` in the app data dir). Holds the
//! optional GitHub token used for authenticated kit discovery.

use serde::{Deserialize, Serialize};

use super::unique_id;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct SettingsFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    github_token: Option<String>,
}

pub fn get_github_token(root: &std::path::Path) -> Result<Option<String>, String> {
    let path = root.join("settings.json");
    match std::fs::read(&path) {
        Ok(bytes) => {
            let settings: SettingsFile = serde_json::from_slice(&bytes)
                .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
            Ok(settings.github_token)
        }
        // No settings file means no token; absent is the default state.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Cannot read {}: {e}", path.display())),
    }
}

pub fn save_github_token(root: &std::path::Path, token: &str) -> Result<(), String> {
    let token = token.trim();
    // Control characters can never form a valid header value; rejecting here
    // keeps the UI's error banner in sync with what actually got stored,
    // instead of a silent clear reported as "Token saved".
    if token.chars().any(char::is_control) {
        return Err(
            "The token contains control characters; copy it again without line breaks".into(),
        );
    }
    // Empty input means "no token".
    let settings = SettingsFile {
        github_token: (!token.is_empty()).then(|| token.to_string()),
    };
    write_json_private(&root.join("settings.json"), &settings)
}

/// Same atomic tmp-file + rename write as `write_json`, but the file holds a
/// credential, so the permissions are pinned to owner-only before the rename
/// (a chmod after rename would leave a window readable by other users).
fn write_json_private(path: &std::path::Path, value: &SettingsFile) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing data directory")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    let temporary = parent.join(format!(".{}.tmp", unique_id()));
    let result = (|| {
        use std::io::Write;
        #[cfg(unix)]
        let mut options = std::fs::OpenOptions::new();
        #[cfg(not(unix))]
        let mut options = {
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create_new(true);
            options
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.write(true).create_new(true).mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        serde_json::to_writer_pretty(&mut file, value).map_err(|e| e.to_string())?;
        file.write_all(b"\n").map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, path).map_err(|e| format!("{}: {e}", path.display()))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}
