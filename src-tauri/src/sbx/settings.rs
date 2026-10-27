//! Sandbox settings: read, set, and unset `sbx` user settings.
//!
//! The CLI's `settings ls --json` output is passed through to the frontend
//! as-is: keys, types, defaults, sources, and restart requirements always
//! come from the installed CLI, never from a Sandy-maintained key list.

use serde::Serialize;

/// One record from `sbx settings ls --json`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingRecord {
    pub key: String,
    #[serde(rename = "type")]
    pub setting_type: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_var: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_restart: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    /// Present when the CLI could not read this setting (e.g. an
    /// administrator-managed key): the value is unknown, not false.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn list_settings() -> Result<Vec<SettingRecord>, String> {
    let out = crate::sbx::run_capture(&["settings", "ls", "--json"])?;
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&out)
        .map_err(|e| format!("sbx settings ls --json did not return JSON: {e}"))?;
    // Field-by-field mapping (rather than a wholesale deserialize) keeps one
    // unusual record from hiding every other setting.
    let records = parsed
        .into_iter()
        .map(|entry| {
            let key = entry
                .get("key")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "setting record without a key".to_string())?;
            let string = |name: &str| entry.get(name).and_then(|v| v.as_str()).map(String::from);
            Ok(SettingRecord {
                key: key.to_string(),
                setting_type: string("type").unwrap_or_else(|| "string".into()),
                description: string("description").unwrap_or_default(),
                default: entry.get("default").cloned(),
                value: entry.get("value").cloned(),
                source: string("source").unwrap_or_else(|| "default".into()),
                env_var: string("env_var"),
                requires_restart: entry.get("requires_restart").and_then(|v| v.as_bool()),
                options: entry
                    .get("options")
                    .and_then(|v| v.as_array())
                    .map(|array| {
                        array
                            .iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    }),
                error: string("error"),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    records
        .iter()
        .all(|record| !record.key.is_empty())
        .then_some(records)
        .ok_or_else(|| "sbx returned an empty setting key".to_string())
}

/// Set a user override. `value_json` is the raw JSON text of the value; the
/// CLI parses it according to the setting's own type.
pub fn set_setting(key: &str, value_json: &str) -> Result<String, String> {
    // One CLI argument per side of the pair: keys and values are passed as
    // arguments, never through a shell.
    crate::sbx::run_capture(&["settings", "set", key, value_json])
}

pub fn unset_setting(key: &str) -> Result<String, String> {
    crate::sbx::run_capture(&["settings", "unset", key])
}

#[cfg(test)]
mod tests {
    // The test module matches the crate's test lint allowances (see mod.rs).
    #[allow(clippy::unwrap_used)]
    #[test]
    fn set_setting_passes_key_and_value_as_separate_arguments() {
        // The test asserts through the command builder, not a live CLI.
        let command =
            crate::sbx::cli::sbx_command(&["settings", "set", "proxy", "http://p:1"]).unwrap();
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            ["settings", "set", "proxy", "http://p:1"]
        );
    }
}
