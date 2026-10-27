//! Application logging. All diagnostics flow through the `log` facade; the
//! Tauri log plugin (registered in `lib.rs`) fans each record out to stdout
//! and to the diagnostic file shown in Settings → Advanced.
//!
//! The diagnostic file holds one JSON object per line so the frontend viewer
//! can parse entries individually; `file_line` produces those lines.

// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;

use std::path::{Path, PathBuf};

use tauri_plugin_log::log;

/// File name (without extension) the plugin's log target writes to. The
/// read/clear commands share it so they never disagree with the target on
/// the file's location.
pub(crate) const LOG_STEM: &str = "sandy-debug";

pub(crate) fn log_path(root: &Path) -> PathBuf {
    root.join(LOG_STEM).with_extension("log")
}

/// One JSON line in the diagnostic log; mirrors `DebugLogEntry` in
/// `src/lib/catalog.ts`.
#[derive(Debug, Clone, serde::Serialize)]
struct LogRecord<'a> {
    /// RFC 3339 UTC timestamp, e.g. `2026-10-18T12:34:56.789Z`.
    timestamp: String,
    /// Log target: `cli`, `http`, `command`, `app`, or a dependency crate name.
    kind: &'a str,
    /// First line of the message.
    summary: String,
    /// Remaining lines, when the message is multi-line.
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    /// `error` for error-level records; absent otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    outcome: Option<&'static str>,
}

/// Milliseconds since the Unix epoch, formatted as RFC 3339 UTC. The `time`
/// crate is already in the dependency tree via Tauri, but its formatting
/// features are not enabled, so the timestamp is composed from the epoch
/// duration directly (no timezone math beyond the UTC offset of zero).
/// The current time as RFC 3339 UTC, shared with caches that stamp when a
/// payload was fetched.
pub(crate) fn now_rfc3339() -> String {
    rfc3339_now()
}

fn rfc3339_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let millis = now.subsec_millis();
    let days = secs / 86_400;
    let seconds_of_day = secs % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z",
        h = seconds_of_day / 3600,
        m = (seconds_of_day % 3600) / 60,
        s = seconds_of_day % 60,
    )
}

/// Howard Hinnant's days-to-civil algorithm: convert days since the Unix
/// epoch into a (year, month, day) UTC date.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m as u32, d as u32)
}

/// Serialize one record as a JSON line for the diagnostic file target. The
/// message's first line becomes the summary; the rest becomes the expandable
/// detail shown by the viewer.
pub(crate) fn file_line(level: log::Level, target: &str, message: &str) -> String {
    let (summary, detail) = match message.split_once('\n') {
        Some((summary, detail)) => (sanitize(summary, 400), Some(sanitize(detail, 4000))),
        None => (sanitize(message, 400), None),
    };
    let line = LogRecord {
        timestamp: rfc3339_now(),
        kind: target,
        summary,
        detail,
        outcome: (level == log::Level::Error).then_some("error"),
    };
    // A record that cannot serialize (impossible in practice) is dropped.
    serde_json::to_string(&line).unwrap_or_default()
}

/// Sanitize a message part: control characters (except tab and newline)
/// become spaces, and very long parts are cut to a bounded tail so a chatty
/// command cannot dominate the log.
fn sanitize(text: &str, max_bytes: usize) -> String {
    let cleaned: String = text
        .chars()
        .map(|c| {
            if c == '\n' || c == '\t' || (!c.is_control() && c != '\u{7f}') {
                c
            } else {
                ' '
            }
        })
        .collect();
    let truncated = if cleaned.len() > max_bytes {
        let mut start = cleaned.len() - max_bytes;
        while !cleaned.is_char_boundary(start) {
            start += 1;
        }
        format!("…{}", &cleaned[start..])
    } else {
        cleaned
    };
    truncated.trim().to_string()
}

/// Record a CLI invocation and its result. Output and error text become the
/// detail part of the entry.
pub(crate) fn cli_call(args: &[&str], result: &Result<String, String>) {
    let summary = format!("sbx {}", args.join(" "));
    match result {
        Ok(output) => log::info!(target: "cli", "{summary}\n{output}"),
        Err(error) => log::error!(target: "cli", "{summary}\n{error}"),
    }
}

/// Record a CLI invocation whose result carries a non-string payload: the
/// payload shape is summarized, errors are logged in full.
pub(crate) fn cli_call_with<E>(args: &[&str], result: &Result<impl Sized, E>)
where
    E: std::fmt::Display,
{
    let summary = format!("sbx {}", args.join(" "));
    match result {
        Ok(_) => log::info!(target: "cli", "{summary}"),
        Err(e) => log::error!(target: "cli", "{summary}\n{e}"),
    }
}

/// Record a Tauri command outcome; error text becomes the detail part.
pub(crate) fn command_call<E>(command: &str, result: &Result<impl Sized, E>)
where
    E: std::fmt::Display,
{
    match result {
        Ok(_) => log::info!(target: "command", "{command}"),
        Err(error) => log::error!(target: "command", "{command}\n{error}"),
    }
}

/// Record an HTTP API request and its result (error text on failure).
pub(crate) fn http_call(method: &str, url: &str, result: &Result<impl Sized, String>) {
    let summary = format!("{method} {url}");
    match result {
        Ok(_) => log::info!(target: "http", "{summary}"),
        Err(e) => log::error!(target: "http", "{summary}\n{e}"),
    }
}
