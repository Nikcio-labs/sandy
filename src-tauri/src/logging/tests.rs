// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[allow(unused_imports)]
use super::{civil_from_days, file_line, log_path, rfc3339_now};
use tauri_plugin_log::log;

fn parse(line: &str) -> serde_json::Value {
    serde_json::from_str(line).unwrap_or_else(|e| panic!("line is JSON: {e} in {line:.100}"))
}

#[test]
fn timestamp_is_rfc3339_utc() {
    let stamp = rfc3339_now();
    // 2026-10-18T12:34:56.789Z — fixed-width, UTC suffix.
    assert_eq!(stamp.len(), 24, "{stamp}");
    assert_eq!(&stamp[4..5], "-");
    assert_eq!(&stamp[7..8], "-");
    assert_eq!(&stamp[10..11], "T");
    assert_eq!(&stamp[13..14], ":");
    assert_eq!(&stamp[16..17], ":");
    assert_eq!(&stamp[19..20], ".");
    assert!(stamp.ends_with('Z'), "{stamp}");
}

#[test]
fn civil_dates_match_known_days() {
    // Day 0 is 1970-01-01.
    assert_eq!(civil_from_days(0), (1970, 1, 1));
    assert_eq!(civil_from_days(1), (1970, 1, 2));
    assert_eq!(civil_from_days(31), (1970, 2, 1));
    // 2024-02-29 (leap day) is 19782 days after the epoch.
    assert_eq!(civil_from_days(19_782), (2024, 2, 29));
    // 2000-02-29, the century leap rule, is 11016 days after the epoch.
    assert_eq!(civil_from_days(11_016), (2000, 2, 29));
}

#[test]
fn file_lines_are_json_with_level_and_target() {
    let value = parse(&file_line(log::Level::Info, "cli", "sbx ls --json"));
    assert!(value["timestamp"].as_str().unwrap().ends_with('Z'));
    assert_eq!(value["kind"], "cli");
    assert_eq!(value["summary"], "sbx ls --json");
    // Informational records carry no outcome field.
    assert!(value.get("outcome").is_none());
}

#[test]
fn error_records_carry_the_error_outcome() {
    let value = parse(&file_line(log::Level::Error, "cli", "sbx up failed\nboom"));
    assert_eq!(value["outcome"], "error");
}

#[test]
fn multi_line_messages_split_summary_from_detail() {
    let value = parse(&file_line(
        log::Level::Error,
        "http",
        "GET https://x\nrate limited",
    ));
    assert_eq!(value["summary"], "GET https://x");
    assert_eq!(value["detail"], "rate limited");
}

#[test]
fn parts_are_sanitized_and_bounded() {
    let noisy = format!("sbx huge\nstart\u{7}mid\u{0}{}", "x".repeat(10_000));
    let line = file_line(log::Level::Error, "cli", &noisy);
    assert!(!line.contains('\u{7}'));
    assert!(!line.contains('\u{0}'));
    let value = parse(&line);
    let detail = value["detail"].as_str().unwrap();
    assert!(detail.starts_with('…'), "kept the tail: {detail}");
    assert!(detail.len() < 4_200, "detail bounded, got {}", detail.len());
    assert!(line.len() < 8_000, "line stays small, got {}", line.len());
}
