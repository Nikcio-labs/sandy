//! Secrets: list and set `sbx`-stored credentials (`sbx secret`).
//!
//! Names, scopes, and presence always come from the CLI's `secret ls --json`
//! output — Sandy maintains no service list. Secret values are write-only:
//! the CLI reports only masked previews (`"(stored)"`, `"abc1****"`), and
//! Sandy never reads or logs a stored value.

use serde::Serialize;

/// One service secret from `sbx secret ls --json`. `scope` is `global` or a
/// sandbox name; `secret` is the CLI's masked preview of the stored value.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceSecretRecord {
    pub scope: String,
    #[serde(rename = "type")]
    pub secret_type: String,
    pub name: String,
    pub secret: String,
}

/// The parsed `secret ls --json` payload. `shadowedServices` names services
/// whose stored value is ignored at runtime (e.g. an OAuth token wins over an
/// API key); `envOnlyCount` counts host env vars `sbx secret import` could
/// pick up.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretList {
    pub secrets: Vec<ServiceSecretRecord>,
    pub custom_secrets: Vec<serde_json::Value>,
    pub shadowed_services: Vec<String>,
    pub env_only_count: u32,
}

pub fn list_secrets() -> Result<SecretList, String> {
    let out = crate::sbx::run_capture(&["secret", "ls", "--json"])?;
    let parsed: serde_json::Value = serde_json::from_str(&out)
        .map_err(|e| format!("sbx secret ls --json did not return JSON: {e}"))?;
    let secrets = parsed
        .get("secrets")
        .and_then(|v| v.as_array())
        .map(|array| {
            array
                .iter()
                .map(|entry| {
                    // Field-by-field mapping keeps one malformed record from
                    // hiding every other secret.
                    let string = |name: &str| -> Result<String, String> {
                        entry
                            .get(name)
                            .and_then(|v| v.as_str())
                            .map(String::from)
                            .ok_or_else(|| format!("secret record without a {name}"))
                    };
                    Ok(ServiceSecretRecord {
                        scope: string("scope")?,
                        secret_type: string("type")?,
                        name: string("name")?,
                        secret: string("secret")?,
                    })
                })
                .collect::<Result<Vec<_>, String>>()
        })
        // An older CLI may omit the array entirely; that still means "none".
        .unwrap_or(Ok(Vec::new()))?;
    Ok(SecretList {
        secrets,
        // Custom secrets are passed through as opaque JSON: the CLI owns the
        // schema (placeholder, targets, env), and Sandy only displays it.
        custom_secrets: parsed
            .get("custom_secrets")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        shadowed_services: parsed
            .get("shadowed_services")
            .and_then(|v| v.as_array())
            .map(|array| {
                array
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        env_only_count: parsed
            .get("env_only_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
            .try_into()
            .unwrap_or(0),
    })
}

/// Store a new value for one secret. The value travels over stdin (with a
/// newline so interactive parsers see a complete line): `sbx secret set`
/// accepts it non-interactively, and argv/logging never see the value.
pub fn set_secret(scope: &str, name: &str, value: &str) -> Result<String, String> {
    let args = match scope {
        "global" => vec!["secret", "set", name],
        sandbox => {
            super::lifecycle::validate_sandbox_name(sandbox)?;
            vec!["secret", "set", name, "--sandbox", sandbox]
        }
    };
    crate::sbx::run_capture_stdin(&args, &format!("{value}\n"))
}

pub fn remove_secret(scope: &str, name: &str) -> Result<String, String> {
    let args = match scope {
        "global" => vec!["secret", "rm", name, "-f"],
        sandbox => {
            super::lifecycle::validate_sandbox_name(sandbox)?;
            vec!["secret", "rm", name, "-f", "--sandbox", sandbox]
        }
    };
    crate::sbx::run_capture(&args)
}

#[cfg(test)]
mod tests {
    // The test module matches the crate's test lint allowances (see mod.rs).
    use crate::sbx::cli::sbx_command;

    // The value must travel over stdin, so argv carries only the selector
    // flags; asserted through the command builder, not a live CLI.
    #[allow(clippy::unwrap_used)]
    #[test]
    fn secret_set_argv_carries_only_the_selector() {
        let command = sbx_command(&["secret", "set", "github", "--sandbox", "box"]).unwrap();
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            ["secret", "set", "github", "--sandbox", "box"]
        );
    }
}
