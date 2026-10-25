//! Setup status: whether the `sbx` CLI is installed, and how far the local
//! configuration (authentication, clipboard setting, SSH) has come.

use std::sync::Mutex;

use serde::Serialize;

use crate::sbx::{self, CheckExplanation};

/// The most recent setup check, shared between windows. The main window and
/// the setup window both need the verdict at boot; one CLI diagnostics run
/// answers both (each run spawns daemon probes and diagnose processes), so
/// the second caller reuses the first's result.
static LAST_STATUS: Mutex<Option<SetupStatus>> = Mutex::new(None);

/// Every call spawns CLI processes (daemon probe, `sbx diagnose`, a settings
/// read), so call it only where the answer can change: once at startup, after
/// a setup action (wizard step, login, SSH setup), or on an explicit user
/// request ("check again"). Never poll it — sandbox data comes from `sbx ls`.
#[derive(Serialize, Clone)]
pub struct SetupStatus {
    pub sbx_installed: bool,
    // Unavailable checks are not evidence that the user signed out or disabled setup.
    pub signed_in: Option<bool>,
    pub image_paste_on: Option<bool>,
    pub ssh_set_up: Option<bool>,
    /// The CLI's own explanation of the Authentication verdict (message,
    /// detail, hint) — available even when the check is unavailable.
    pub auth_explanation: Option<CheckExplanation>,
    /// The CLI's own explanation of the SSH config verdict.
    pub ssh_explanation: Option<CheckExplanation>,
    /// A non-blocking note about a check whose verdict may be a false alarm
    /// (e.g. the SSH config check's known Windows false alarm).
    pub warnings: Vec<String>,
    pub issues: Vec<String>,
}

/// The mutex is only ever held for a clone/assignment (no user code runs
/// under it), so a poisoned lock cannot reflect inconsistent app state; the
/// stored value is simply replaced.
fn cached_status() -> std::sync::MutexGuard<'static, Option<SetupStatus>> {
    LAST_STATUS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub(crate) fn check_setup() -> Result<SetupStatus, String> {
    if let Some(cached) = cached_status().clone() {
        return Ok(cached);
    }
    let status = run_check()?;
    *cached_status() = Some(status.clone());
    Ok(status)
}

/// Drop the cached verdict so the next check runs for real. Called when the
/// setup wizard completes a step (its actions can change the verdict) and
/// by the "check again" buttons.
pub(crate) fn invalidate_check() {
    *cached_status() = None;
}

fn run_check() -> Result<SetupStatus, String> {
    let sbx_installed = sbx::is_sbx_installed();
    if !sbx_installed {
        return Ok(SetupStatus {
            sbx_installed,
            signed_in: Some(false),
            image_paste_on: Some(false),
            ssh_set_up: Some(false),
            auth_explanation: None,
            ssh_explanation: None,
            warnings: Vec::new(),
            issues: Vec::new(),
        });
    }
    let mut issues = Vec::new();
    fn checked(result: Result<bool, String>, issues: &mut Vec<String>) -> Option<bool> {
        match result {
            Ok(value) => Some(value),
            Err(error) => {
                issues.push(error);
                None
            }
        }
    }
    // One diagnose run answers both sign-in and SSH; a shared failure is
    // reported once.
    let checks = sbx::diagnose_setup_checks();
    let mut shared_issue: Option<String> = None;
    let signed_in = match checks.signed_in {
        Ok(value) => Some(value),
        Err(error) => {
            shared_issue = Some(error);
            None
        }
    };
    let ssh_set_up = match checks.ssh_set_up {
        Ok(value) => Some(value),
        Err(error) => {
            // The two checks fail together whenever the diagnose run itself
            // failed (identical errors). Differing errors mean two distinct
            // problems, so keep both.
            if shared_issue.as_deref() != Some(error.as_str()) {
                if let Some(previous) = shared_issue.take() {
                    issues.push(previous);
                }
                shared_issue = Some(error);
            }
            None
        }
    };
    if let Some(error) = shared_issue {
        issues.push(error);
    }
    let warnings: Vec<String> = checks.ssh_warning.into_iter().collect();
    let auth_explanation = checks.auth_explanation;
    let ssh_explanation = checks.ssh_explanation;
    let image_paste_on = checked(
        sbx::get_setting("clipboard.imagePaste").and_then(|value| {
            if value.eq_ignore_ascii_case("true") {
                Ok(true)
            } else if value.eq_ignore_ascii_case("false") {
                Ok(false)
            } else {
                Err("Could not determine whether clipboard image pasting is enabled".into())
            }
        }),
        &mut issues,
    );
    Ok(SetupStatus {
        sbx_installed,
        signed_in,
        image_paste_on,
        ssh_set_up,
        auth_explanation,
        ssh_explanation,
        warnings,
        issues,
    })
}
