//! Launch progress reporting from the blocking `sbx` workers to the frontend.
//!
//! Tauri channels are the supported way to push data from commands while they
//! run. Phases tell the dialog which step is active; `Output` carries a raw
//! `sbx env create` console line for the live log.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LaunchProgress {
    /// Preparing the environment file (before any CLI call).
    Preparing,
    /// Extending the kit source policy for a GitHub provider.
    Authorizing,
    /// `sbx env create` is running; console lines arrive as `Output`.
    Creating,
    /// The environment exists; `sbx run --detach` is starting it.
    Starting,
    /// The sandbox is created and started.
    Ready,
    /// One console line from `sbx env create`.
    Output {
        #[serde(rename = "text")]
        line: String,
    },
}
