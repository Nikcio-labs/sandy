//! Stored secrets via `sbx secret`: listing, setting, and removing.
//! Secret values travel over stdin only — never argv or the diagnostic log.

use serde::{Deserialize, Serialize};

use super::cli::run_capture;
use super::lifecycle::validate_sandbox_name;
use super::status::ensure_daemon;

/// One entry of `sbx secret ls --json`. `scope` is "global", a sandbox name,
/// or "host-only" (registry credentials that never enter sandboxes).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecretEntry {
    pub scope: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub secret: String,
    /// Custom secrets route by target host instead of a service name.
    #[serde(default)]
    pub targets: Vec<String>,
    /// Custom secrets set this environment variable inside the sandbox.
    #[serde(default)]
    pub env: String,
    /// Custom secrets are removed by their placeholder, not by a service name.
    #[serde(default)]
    pub placeholder: String,
}

#[derive(Debug, Deserialize)]
struct SecretListing {
    #[serde(default)]
    secrets: Vec<SecretEntry>,
    #[serde(default)]
    custom_secrets: Vec<SecretEntry>,
}

pub fn list_secrets(scope: Option<&str>) -> Result<Vec<SecretEntry>, String> {
    // An empty scope means "global only"; None lists every stored secret.
    if let Some(sandbox) = scope.filter(|sandbox| !sandbox.is_empty()) {
        validate_sandbox_name(sandbox)?;
    }
    ensure_daemon()?;
    let mut args = vec!["secret", "ls", "--json"];
    if let Some(scope) = scope {
        if scope.is_empty() {
            args.push("-g");
        } else {
            args.extend(["--sandbox", scope]);
        }
    }
    let output = run_capture(&args)?;
    let listing: SecretListing = serde_json::from_str(&output)
        .map_err(|e| format!("sbx secret ls --json returned unreadable JSON: {e}"))?;
    let mut entries = listing.secrets;
    entries.extend(listing.custom_secrets);
    Ok(entries)
}

/// Store a service secret, reading the value from stdin. `scope` mirrors the
/// list scopes: None or "global" stores globally, empty means global, and a
/// sandbox name scopes the secret to that sandbox.
pub fn set_secret(
    service: &str,
    value: &str,
    scope: Option<&str>,
    force: bool,
) -> Result<String, String> {
    let service = service.trim();
    if service.is_empty()
        || service.starts_with('-')
        || !service
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err(
            "Secret service names use only letters, numbers, hyphens, and underscores".into(),
        );
    }
    if value.is_empty() {
        return Err("Enter a secret value".into());
    }
    let mut args = vec!["secret", "set"];
    if let Some(sandbox) = scope.filter(|sandbox| !sandbox.is_empty()) {
        validate_sandbox_name(sandbox)?;
        args.extend(["--sandbox", sandbox]);
    }
    if force {
        args.push("-f");
    }
    args.push(service);
    run_secret_with_stdin(&args, value)
}

/// Store a custom (host-targeted) secret. The sandbox sees a generated
/// placeholder for `env`; the proxy swaps in the real value per request.
pub fn set_custom_secret(
    hosts: &[&str],
    env: &str,
    value: &str,
    scope: Option<&str>,
) -> Result<String, String> {
    if hosts.is_empty() {
        return Err("Enter at least one target host".into());
    }
    let env = env.trim();
    if env.is_empty()
        || !env.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        || env
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_digit())
    {
        return Err("Environment variable names start with a letter or underscore and use only letters, numbers, and underscores".into());
    }
    if value.is_empty() {
        return Err("Enter a secret value".into());
    }
    let mut args = vec!["secret", "set-custom"];
    if let Some(sandbox) = scope.filter(|sandbox| !sandbox.is_empty()) {
        validate_sandbox_name(sandbox)?;
        args.extend(["--sandbox", sandbox]);
    }
    for host in hosts {
        let host = host.trim();
        if host.is_empty() || host.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err(format!("Invalid target host: {host:?}"));
        }
        args.extend(["--host", host]);
    }
    args.extend(["--env", env, "--value", value]);
    run_secret_with_stdin(&args, value)
}

pub fn delete_secret(
    service: &str,
    scope: Option<&str>,
    placeholder: Option<&str>,
    registry: bool,
) -> Result<String, String> {
    let placeholder = placeholder.map(str::trim);
    if placeholder == Some("") {
        return Err("Choose the custom secret to remove by its placeholder".into());
    }
    let service = service.trim();
    if placeholder.is_none() && service.is_empty() {
        return Err("Choose the secret to remove".into());
    }
    let mut args = vec!["secret", "rm", "-f"];
    if let Some(placeholder) = placeholder {
        // Custom secrets have no service name; they are keyed by placeholder.
        args.push("--placeholder");
        args.push(placeholder);
    } else if registry {
        args.push("--registry");
        args.push(service);
    } else {
        args.push(service);
    }
    if let Some(sandbox) = scope.filter(|sandbox| !sandbox.is_empty()) {
        validate_sandbox_name(sandbox)?;
        args.extend(["--sandbox", sandbox]);
    }
    run_capture(&args)
}

/// `sbx secret set` reads the value on stdin (and prints its confirmation to
/// stderr/stdout); the value must never reach argv or the captured log.
fn run_secret_with_stdin(args: &[&str], value: &str) -> Result<String, String> {
    use std::io::Write;
    use std::process::Stdio;

    let mut child = super::cli::sbx_command(args)?
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run {}: {e}", super::cli::SBX_COMMAND))?;
    // Dropping the handle closes stdin, so the CLI finishes reading its value.
    child
        .stdin
        .take()
        .ok_or_else(|| format!("{} produced no stdin handle", super::cli::SBX_COMMAND))?
        .write_all(value.as_bytes())
        .map_err(|e| {
            format!(
                "failed to write the secret to {}: {e}",
                super::cli::SBX_COMMAND
            )
        })?;
    let output = child
        .wait_with_output()
        .map_err(|e| format!("failed to wait for {}: {e}", super::cli::SBX_COMMAND))?;
    let outcome = if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let mut msg = String::from_utf8_lossy(&output.stderr).to_string();
        if msg.trim().is_empty() {
            msg = String::from_utf8_lossy(&output.stdout).to_string();
        }
        Err(format!(
            "{} {} failed (exit {}):\n{}",
            super::cli::SBX_COMMAND,
            args.join(" "),
            output.status.code().unwrap_or(-1),
            msg.trim()
        ))
    };
    // Diagnostics record the invocation, never the piped value.
    crate::diaglog::cli_call(args, &outcome);
    outcome
}
