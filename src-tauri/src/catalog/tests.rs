use std::io::{Read, Write};
use std::net::TcpListener;

use super::descriptor::option_from_descriptor;
use super::git::parse_ref_advertisement;
use super::http::Api;
use super::settings::{get_catalog_settings, save_catalog_settings};
use super::types::{Catalog, Provider};
use super::{
    BUILTIN_AGENTS, GitMode, discover_with, encoded_path, get_providers, save_providers, unique_id,
    versions_with,
};

fn fixture(routes: Vec<(&str, &str)>) -> (Api, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let routes: Vec<_> = routes
        .into_iter()
        .map(|(p, b)| (p.to_string(), b.to_string()))
        .collect();
    let worker = std::thread::spawn(move || {
        for (path, body) in routes {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let n = stream.read(&mut request).unwrap();
            assert!(String::from_utf8_lossy(&request[..n]).starts_with(&format!("GET {path} ")));
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        }
    });
    let mut api = Api::public().unwrap();
    api.github = base.clone();
    api.github_git = base.clone();
    api.raw = base.clone();
    (api, worker)
}

fn pkt(payload: &str) -> String {
    format!("{:04x}{}", payload.len() + 4, payload)
}

/// A v0 smart-HTTP ref advertisement: service preamble, ref lines (the
/// first carrying capabilities), and flush packets.
fn advertisement(entries: &[String]) -> String {
    let mut body = pkt("# service=git-upload-pack\n");
    body.push_str("0000");
    for entry in entries {
        body.push_str(&pkt(entry));
    }
    body.push_str("0000");
    body
}

#[test]
fn github_api_resolves_selected_tag_and_discovers_descriptor() {
    let (api, worker) = fixture(vec![
        ("/repos/team/kits/commits/v1.0", r#"{"sha":"abc123"}"#),
        (
            "/repos/team/kits/git/trees/abc123?recursive=1",
            r#"{"tree":[{"type":"blob","path":"tool/spec.yaml"}]}"#,
        ),
        (
            "/team/kits/abc123/tool/spec.yaml",
            "schemaVersion: '2'\nkind: mixin\nname: tool\nrequires: {agent: claude}\nargs:\n  channel:\n    required: true\n    enum: [stable, beta]\n",
        ),
    ]);
    let provider = Provider {
        id: "custom".into(),
        label: "Test".into(),
        kind: "github".into(),
        repository: "team/kits".into(),
        reference: "v1.0".into(),
        enabled: true,
    };
    let result = discover_with(&api, GitMode::Rest, &[provider]).unwrap();
    assert!(result.warnings.is_empty(), "{:?}", result.warnings);
    assert_eq!(result.kits.len(), 1);
    assert_eq!(
        result.kits[0].source,
        "git+https://github.com/team/kits.git#ref=abc123&dir=tool"
    );
    assert_eq!(result.kits[0].required_agent.as_deref(), Some("claude"));
    assert_eq!(result.kits[0].arguments[0].choices, ["stable", "beta"]);
    worker.join().unwrap();
}

#[test]
fn manual_github_branch_and_commit_do_not_list_tags() {
    for reference in ["feature/next", "abc123"] {
        // The fixture has no tag endpoint. An attempt to list tags fails
        // the expected-request assertion instead of masking the bug.
        let commit_path = format!("/repos/team/kits/commits/{}", encoded_path(reference));
        let (api, worker) = fixture(vec![
            (&commit_path, r#"{"sha":"abc123"}"#),
            (
                "/repos/team/kits/git/trees/abc123?recursive=1",
                r#"{"tree":[{"type":"blob","path":"tool/spec.yaml"}]}"#,
            ),
            (
                "/team/kits/abc123/tool/spec.yaml",
                "schemaVersion: '2'\nkind: mixin\nname: tool\n",
            ),
        ]);
        let provider = Provider {
            id: "manual".into(),
            label: "Manual reference".into(),
            kind: "github".into(),
            repository: "team/kits".into(),
            reference: reference.into(),
            enabled: true,
        };
        let catalog = discover_with(&api, GitMode::Rest, &[provider]).unwrap();
        assert!(catalog.warnings.is_empty(), "{:?}", catalog.warnings);
        assert_eq!(catalog.kits.len(), 1);
        assert!(catalog.kits[0].source.contains("#ref=abc123&dir=tool"));
        worker.join().unwrap();
    }
}

#[test]
fn normalized_v3_and_typed_filtering() {
    let value = serde_json::json!({"schemaVersion":"3","kind":"sandbox","name":"sbx-kit-claude"});
    assert_eq!(
        option_from_descriptor(
            &value,
            "docker.io/docker/sbx-kit-claude:1",
            "hub",
            "fallback"
        )
        .unwrap()
        .kind,
        "workload"
    );
    let value = serde_json::json!({"schemaVersion":"3","kind":"workload"});
    assert_eq!(
        option_from_descriptor(&value, "source", "id", "alpine")
            .unwrap()
            .name,
        "alpine"
    );
    assert!(
        option_from_descriptor(
            &serde_json::json!({"schemaVersion":"1","kind":"mixin"}),
            "s",
            "p",
            "n"
        )
        .is_err()
    );
}

#[test]
fn provider_failure_preserves_other_provider_results() {
    let (api, worker) = fixture(vec![
        (
            "/repos/broken/kits/tags?per_page=100&page=1",
            "invalid-json",
        ),
        (
            "/repos/team/kits/tags?per_page=100&page=1",
            r#"[{"name":"v3","commit":{"sha":"abc123"}}]"#,
        ),
        (
            "/repos/team/kits/git/trees/abc123?recursive=1",
            r#"{"tree":[{"type":"blob","path":"workload/workload.yaml"}]}"#,
        ),
        (
            "/team/kits/abc123/workload/workload.yaml",
            "schemaVersion: '3'\nkind: workload\n",
        ),
    ]);
    let providers = ["broken/kits", "team/kits"].map(|repository| Provider {
        id: repository.into(),
        label: repository.into(),
        kind: "github".into(),
        repository: repository.into(),
        reference: String::new(),
        enabled: true,
    });
    let catalog = discover_with(&api, GitMode::Rest, &providers).unwrap();
    assert_eq!(catalog.kits.len(), 1);
    assert_eq!(catalog.warnings.len(), 1);
    assert!(catalog.warnings[0].contains("broken/kits"));
    worker.join().unwrap();
}

#[test]
fn providers_round_trip_and_report_corruption() {
    let root = std::env::temp_dir().join(format!("sandy-catalog-{}", unique_id()));
    let providers = get_providers(&root).unwrap();
    save_providers(&root, providers.clone()).unwrap();
    assert_eq!(get_providers(&root).unwrap(), providers);
    std::fs::write(root.join("providers.json"), "not json").unwrap();
    assert!(get_providers(&root).unwrap_err().contains("providers.json"));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn default_providers_exclude_removed_hub_and_saved_entries_are_dropped() {
    let root = std::env::temp_dir().join(format!("sandy-catalog-{}", unique_id()));
    // The shipped defaults are GitHub-only.
    let defaults = get_providers(&root).unwrap();
    assert_eq!(defaults.len(), 1);
    assert_eq!(defaults[0].kind, "github");
    // An older configuration's Docker Hub entries are dropped, not fatal.
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(
        root.join("providers.json"),
        r#"[
            {"id":"hub","label":"Hub","kind":"dockerhub","repository":"https://hub.docker.com/search?type=sbx_kit","reference":"","enabled":true},
            {"id":"gh","label":"GH","kind":"github","repository":"team/kits","reference":"","enabled":true}
        ]"#,
    )
    .unwrap();
    let providers = get_providers(&root).unwrap();
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].id, "gh");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn builtin_agents_match_the_documented_list() {
    assert_eq!(
        BUILTIN_AGENTS,
        [
            "claude",
            "codex",
            "copilot",
            "cursor",
            "devin",
            "docker-agent",
            "droid",
            "gemini",
            "kiro",
            "opencode",
            "shell",
        ]
    );
}

#[test]
fn discovery_cache_serves_same_configuration_and_misses_on_change() {
    let root = std::env::temp_dir().join(format!("sandy-cache-{}", unique_id()));
    let providers = [Provider {
        id: "p".into(),
        label: "P".into(),
        kind: "github".into(),
        repository: "nikcio/docker-sandboxing".into(),
        reference: String::new(),
        enabled: true,
    }];
    assert!(super::cache::read_catalog(&root, &providers).is_none());
    super::cache::write_catalog(
        &root,
        &providers,
        &Catalog {
            kits: Vec::new(),
            warnings: vec!["from-cache".into()],
        },
    );
    let cached = super::cache::read_catalog(&root, &providers).expect("cached catalog");
    assert_eq!(cached.warnings, ["from-cache"]);

    // A changed configuration must not be served the old result.
    let mut changed = providers[0].clone();
    changed.reference = "v9.9.9".into();
    assert!(super::cache::read_catalog(&root, std::slice::from_ref(&changed)).is_none());

    // Corrupt cache content is a miss, not an error.
    std::fs::write(root.join("cache").join("catalog.json"), "not json").unwrap();
    assert!(super::cache::read_catalog(&root, &providers).is_none());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn version_cache_keeps_entries_per_provider_and_misses_on_change() {
    let root = std::env::temp_dir().join(format!("sandy-cache-{}", unique_id()));
    let provider = Provider {
        id: "p".into(),
        label: "P".into(),
        kind: "github".into(),
        repository: "team/kits".into(),
        reference: String::new(),
        enabled: true,
    };
    assert!(super::cache::read_versions(&root, &provider).is_none());
    super::cache::write_versions(&root, &provider, &["v1".into(), "v0".into()]);
    assert_eq!(
        super::cache::read_versions(&root, &provider).expect("cached versions"),
        ["v1", "v0"]
    );

    // A second provider's entry coexists with the first.
    let mut other = provider.clone();
    other.id = "q".into();
    other.repository = "other/kits".into();
    super::cache::write_versions(&root, &other, &["x".into()]);
    assert_eq!(
        super::cache::read_versions(&root, &provider).unwrap(),
        ["v1", "v0"]
    );
    assert_eq!(super::cache::read_versions(&root, &other).unwrap(), ["x"]);

    // A changed reference invalidates the entry: the fingerprint is
    // deliberately per-configuration, so a stale list can never mask a
    // reference switch.
    let mut changed = provider.clone();
    changed.reference = "v1.0".into();
    assert!(super::cache::read_versions(&root, &changed).is_none());

    // Re-writing replaces instead of appending duplicates.
    super::cache::write_versions(&root, &provider, &["v2".into()]);
    assert_eq!(
        super::cache::read_versions(&root, &provider).unwrap(),
        ["v2"]
    );
    let bytes = std::fs::read_to_string(root.join("cache").join("versions.json")).unwrap();
    assert_eq!(bytes.matches("\"key\"").count(), 2, "{bytes}");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn ref_advertisement_parses_tags_peel_symref_and_version_order() {
    let body = advertisement(&[
        // The first line carries capabilities, including the HEAD symref.
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\0multi_ack thin-pack symref=HEAD:refs/heads/main".into(),
        "1111111111111111111111111111111111111111 refs/heads/main".into(),
        "2222222222222222222222222222222222222222 refs/tags/v2.0".into(),
        "3333333333333333333333333333333333333333 refs/tags/v2.0^{}".into(),
        "4444444444444444444444444444444444444444 refs/tags/v10.0".into(),
        "5555555555555555555555555555555555555555 refs/tags/v10.0^{}".into(),
        "6666666666666666666666666666666666666666 refs/tags/v1.0-annotated".into(),
        "7777777777777777777777777777777777777777 refs/tags/v1.0-annotated^{}".into(),
        "8888888888888888888888888888888888888888 refs/tags/v1.0-lightweight".into(),
    ]);
    let refs = parse_ref_advertisement(&body).unwrap();
    assert_eq!(
        refs.tag_names(),
        ["v10.0", "v2.0", "v1.0-lightweight", "v1.0-annotated"]
    );
    // Annotated tags resolve to the peeled commit, lightweight tags to
    // their own SHA.
    assert_eq!(
        refs.resolve("v2.0").unwrap(),
        "3333333333333333333333333333333333333333"
    );
    assert_eq!(
        refs.resolve("v10.0").unwrap(),
        "5555555555555555555555555555555555555555"
    );
    assert_eq!(
        refs.resolve("v1.0-annotated").unwrap(),
        "7777777777777777777777777777777777777777"
    );
    assert_eq!(
        refs.resolve("v1.0-lightweight").unwrap(),
        "8888888888888888888888888888888888888888"
    );
    assert_eq!(
        refs.resolve("main").unwrap(),
        "1111111111111111111111111111111111111111"
    );
    assert_eq!(
        refs.resolve("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
            .unwrap(),
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    assert!(refs.resolve("nope").is_err());
    // No tags: the advertisement's HEAD symref gives the default branch.
    let body = advertisement(&[
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\0symref=HEAD:refs/heads/develop".into(),
        "1111111111111111111111111111111111111111 refs/heads/develop".into(),
    ]);
    let refs = parse_ref_advertisement(&body).unwrap();
    assert_eq!(
        refs.latest_commit().unwrap(),
        "1111111111111111111111111111111111111111"
    );
    // A server may omit the symref capability but still advertise a real
    // HEAD line; its SHA is the default-branch fallback.
    let body = advertisement(&[
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD".into(),
        "1111111111111111111111111111111111111111 refs/heads/main".into(),
    ]);
    let refs = parse_ref_advertisement(&body).unwrap();
    assert_eq!(
        refs.latest_commit().unwrap(),
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
}

#[test]
fn ref_advertisement_rejects_errors_and_empty_repos() {
    let body = format!("{}0000", pkt("ERR repository not found"));
    let error = parse_ref_advertisement(&body).unwrap_err();
    assert_eq!(error, "repository not found");
    // Only flush packets: nothing usable was advertised.
    assert!(parse_ref_advertisement("0000").is_err());
    // A zero SHA HEAD is an unborn branch; without any real refs this is
    // an empty repository, not a discoverable one.
    let body = advertisement(&["0000000000000000000000000000000000000000 HEAD\0".into()]);
    assert!(parse_ref_advertisement(&body).is_err());
}

#[test]
fn ref_advertisement_handles_malformed_framing_without_panicking() {
    // A declared length below the 4 length bytes itself is inverted framing.
    for body in ["0001", "0002ab", "0003abc"] {
        assert!(
            parse_ref_advertisement(body).is_err(),
            "{body} must fail cleanly"
        );
    }
    // Non-hex and multibyte-UTF-8 prefixes must stop iteration, not panic
    // on a char-boundary or radix failure.
    for body in [
        "éééx",
        "zzzz not hex",
        &format!("{}{}", pkt("ok line"), "xx"),
    ] {
        assert!(
            parse_ref_advertisement(body).is_err(),
            "{body} must fail cleanly"
        );
    }
}

#[test]
fn short_sha_references_resolve_uniquely_or_error_on_ambiguity() {
    let body = advertisement(&[
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\0symref=HEAD:refs/heads/main".into(),
        "1111111111111111111111111111111111111111 refs/heads/main".into(),
        "2222222222222222222222222222222222222222 refs/tags/v1.0".into(),
        "3333333333333333333333333333333333333333 refs/tags/v1.0^{}".into(),
    ]);
    let refs = parse_ref_advertisement(&body).unwrap();
    // A unique prefix matches the advertised SHA, including the peeled
    // commit and HEAD.
    assert_eq!(
        refs.resolve("222222").unwrap(),
        "2222222222222222222222222222222222222222"
    );
    assert_eq!(
        refs.resolve("333333").unwrap(),
        "3333333333333333333333333333333333333333"
    );
    assert_eq!(
        refs.resolve("aaaaaa").unwrap(),
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    // Too short to be meaningful, or matching nothing, keeps the existing
    // not-resolved error.
    assert!(refs.resolve("22").is_err());
    assert!(refs.resolve("999999").is_err());
    // Two distinct SHAs sharing a prefix are ambiguous.
    let body = advertisement(&[
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD".into(),
        "2222222222222222222222222222222222222222 refs/tags/v1.0".into(),
        "2222229999999999999999999999999999999999 refs/tags/v2.0".into(),
    ]);
    let refs = parse_ref_advertisement(&body).unwrap();
    assert!(refs.resolve("222222").is_err());
    // A tag and its peeled commit pointing at the same SHA are one commit,
    // so the same prefix stays unambiguous.
    let body = advertisement(&[
        "2222222222222222222222222222222222222222 refs/tags/v1.0".into(),
        "2222222222222222222222222222222222222222 refs/tags/v1.0^{}".into(),
    ]);
    let refs = parse_ref_advertisement(&body).unwrap();
    assert_eq!(
        refs.resolve("222222").unwrap(),
        "2222222222222222222222222222222222222222"
    );
}

#[test]
fn github_git_mode_resolves_reference_and_discovers_descriptor() {
    // The tree and raw routes are REST/raw as in production; only ref
    // listing and resolution moved to the git protocol.
    for (reference, commit, expected_source) in [
        (
            "v1.0",
            "2222222222222222222222222222222222222222",
            "git+https://github.com/team/kits.git#ref=2222222222222222222222222222222222222222&dir=tool",
        ),
        (
            "main",
            "1111111111111111111111111111111111111111",
            "git+https://github.com/team/kits.git#ref=1111111111111111111111111111111111111111&dir=tool",
        ),
    ] {
        let provider = Provider {
            id: "custom".into(),
            label: "Test".into(),
            kind: "github".into(),
            repository: "team/kits".into(),
            reference: reference.into(),
            enabled: true,
        };
        let (api, worker) = fixture(vec![
            (
                "/team/kits.git/info/refs?service=git-upload-pack",
                &advertisement(&[
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\0symref=HEAD:refs/heads/main"
                        .into(),
                    "1111111111111111111111111111111111111111 refs/heads/main".into(),
                    "2222222222222222222222222222222222222222 refs/tags/v1.0".into(),
                    "2222222222222222222222222222222222222222 refs/tags/v1.0^{}".into(),
                ]),
            ),
            (
                &format!("/repos/team/kits/git/trees/{commit}?recursive=1"),
                r#"{"tree":[{"type":"blob","path":"tool/spec.yaml"}]}"#,
            ),
            (
                &format!("/team/kits/{commit}/tool/spec.yaml"),
                "schemaVersion: '2'\nkind: mixin\nname: tool\nrequires: {agent: claude}\n",
            ),
        ]);
        let catalog = discover_with(&api, GitMode::Git, &[provider]).unwrap();
        assert!(catalog.warnings.is_empty(), "{:?}", catalog.warnings);
        assert_eq!(catalog.kits.len(), 1);
        assert_eq!(catalog.kits[0].source, expected_source);
        worker.join().unwrap();
    }
}

#[test]
fn github_git_mode_uses_latest_tag_without_reference() {
    let (api, worker) = fixture(vec![
        (
            "/team/kits.git/info/refs?service=git-upload-pack",
            &advertisement(&[
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\0symref=HEAD:refs/heads/main".into(),
                "1111111111111111111111111111111111111111 refs/heads/main".into(),
                "2222222222222222222222222222222222222222 refs/tags/v2.0".into(),
                "3333333333333333333333333333333333333333 refs/tags/v2.0^{}".into(),
                "4444444444444444444444444444444444444444 refs/tags/v1.0".into(),
            ]),
        ),
        (
            "/repos/team/kits/git/trees/3333333333333333333333333333333333333333?recursive=1",
            r#"{"tree":[{"type":"blob","path":"tool/spec.yaml"}]}"#,
        ),
        (
            "/team/kits/3333333333333333333333333333333333333333/tool/spec.yaml",
            "schemaVersion: '2'\nkind: mixin\nname: tool\n",
        ),
    ]);
    let provider = Provider {
        id: "latest".into(),
        label: "Latest".into(),
        kind: "github".into(),
        repository: "team/kits".into(),
        reference: String::new(),
        enabled: true,
    };
    let catalog = discover_with(&api, GitMode::Git, &[provider]).unwrap();
    assert!(catalog.warnings.is_empty(), "{:?}", catalog.warnings);
    // The annotated tag's peeled commit is the discovery commit, and the
    // kit source stays byte-identical to the REST-era format.
    assert_eq!(
        catalog.kits[0].source,
        "git+https://github.com/team/kits.git#ref=3333333333333333333333333333333333333333&dir=tool"
    );
    worker.join().unwrap();
}

#[test]
fn versions_with_git_mode_reads_tag_names_from_advertisement() {
    let (api, worker) = fixture(vec![(
        "/team/kits.git/info/refs?service=git-upload-pack",
        &advertisement(&[
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\0symref=HEAD:refs/heads/main".into(),
            "1111111111111111111111111111111111111111 refs/heads/main".into(),
            "2222222222222222222222222222222222222222 refs/tags/v10.0".into(),
            "3333333333333333333333333333333333333333 refs/tags/v2.0".into(),
        ]),
    )]);
    let provider = Provider {
        id: "versions".into(),
        label: "Versions".into(),
        kind: "github".into(),
        repository: "team/kits".into(),
        reference: String::new(),
        enabled: true,
    };
    let versions = versions_with(&api, GitMode::Git, &provider).unwrap();
    assert_eq!(versions, ["v10.0", "v2.0"]);
    worker.join().unwrap();
}

#[test]
fn catalog_settings_round_trip_and_default_when_missing() {
    let root = std::env::temp_dir().join(format!("sandy-catalog-{}", unique_id()));
    assert_eq!(
        get_catalog_settings(&root).unwrap(),
        super::settings::CatalogSettings::default()
    );
    let settings = super::settings::CatalogSettings {
        discovery_use_git_protocol: false,
    };
    let saved = save_catalog_settings(&root, settings.clone()).unwrap();
    assert_eq!(get_catalog_settings(&root).unwrap(), saved);
    assert!(
        !get_catalog_settings(&root)
            .unwrap()
            .discovery_use_git_protocol
    );
    // A file with the field omitted falls back to the default rather than
    // failing, so older or partial files keep loading.
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("settings.json"), "{}").unwrap();
    assert!(
        get_catalog_settings(&root)
            .unwrap()
            .discovery_use_git_protocol
    );
    std::fs::write(root.join("settings.json"), "not json").unwrap();
    assert!(
        get_catalog_settings(&root)
            .unwrap_err()
            .contains("settings.json")
    );
    std::fs::remove_dir_all(root).unwrap();
}
