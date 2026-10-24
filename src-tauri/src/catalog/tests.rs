use std::io::{Read, Write};
use std::net::TcpListener;

use super::descriptor::option_from_descriptor;
use super::http::Api;
use super::types::{Catalog, Provider};
use super::{
    BUILTIN_AGENTS, discover_with, encoded_path, get_providers, save_providers, unique_id,
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
    api.raw = base.clone();
    (api, worker)
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
    let result = discover_with(&api, &[provider]).unwrap();
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
        let catalog = discover_with(&api, &[provider]).unwrap();
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
    // V2 credentials arrive as a top-level list; v3 as capability configs.
    // Required wins over optional across entries, duplicates are dropped.
    let kit = option_from_descriptor(
        &serde_json::json!({"schemaVersion":"2","kind":"mixin","name":"kit",
            "credentials":[{"service":"linear"},{"service":"github","required":true}]}),
        "s",
        "p",
        "n",
    )
    .unwrap();
    assert_eq!(
        kit.credentials,
        [
            crate::catalog::KitCredential {
                service: "github".into(),
                required: true
            },
            crate::catalog::KitCredential {
                service: "linear".into(),
                required: false
            },
        ]
    );
    let kit = option_from_descriptor(
        &serde_json::json!({"schemaVersion":"2","kind":"mixin","name":"kit",
            "credentials":[{"service":"openai","required":true}]}),
        "s",
        "p",
        "n",
    )
    .unwrap();
    assert_eq!(kit.credentials.len(), 1);
    let kit = option_from_descriptor(
        &serde_json::json!({"schemaVersion":"2","kind":"mixin","name":"kit",
            "credentials":[{"service":"github"},{"service":"openai","required":true}]}),
        "s",
        "p",
        "n",
    )
    .unwrap();
    assert_eq!(kit.credentials.len(), 2);
    // V3: the credential capability names the service; an existing v2 entry
    // with the same service is never duplicated.
    let kit = option_from_descriptor(
        &serde_json::json!({"schemaVersion":"2","kind":"mixin","name":"kit",
        "credentials":[{"service":"github","required":true}],
        "capabilities":[
            {"type":"com.docker.sandbox/network-policy@1"},
            {"type":"com.docker.sandbox/credential@1","config":{"service":"github"}},
            {"type":"com.docker.sandbox/credential@1","config":{"service":"linear"}}
        ]}),
        "s",
        "p",
        "n",
    )
    .unwrap();
    assert_eq!(
        kit.credentials,
        [
            crate::catalog::KitCredential {
                service: "github".into(),
                required: true
            },
            crate::catalog::KitCredential {
                service: "linear".into(),
                required: false
            },
        ]
    );
    // Entries without a service name are skipped, not fatal.
    let kit = option_from_descriptor(
        &serde_json::json!({"schemaVersion":"2","kind":"mixin","name":"kit",
            "credentials":[{"required":true},{"service":"linear"}]}),
        "s",
        "p",
        "n",
    )
    .unwrap();
    assert_eq!(kit.credentials.len(), 1);
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
    let catalog = discover_with(&api, &providers).unwrap();
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
