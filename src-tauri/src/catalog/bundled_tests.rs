//! Consistency checks for the bundled mixin snapshot. The network test may
//! unwrap freely — a panic is exactly the failure mode.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::print_stdout
)]

use std::path::{Path, PathBuf};

use super::bundled::{BUNDLED_RELEASES, REPOSITORY};
use super::encoded;
use super::types::{Catalog, Provider};

const RAW: &str = "https://raw.githubusercontent.com/nikcio/docker-sandboxing";

/// Where build.rs fetches the snapshot; also `bundle.resources` in
/// tauri.conf.json.
fn bundle() -> PathBuf {
    Path::new(&env!("CARGO_MANIFEST_DIR")).join("target/snapshot/mixins")
}

/// Whether a fetched snapshot exists (a plain `cargo test` on a fresh clone
/// has none until the first build ran).
fn snapshot_available() -> bool {
    bundle().is_dir()
}

#[test]
fn bundled_catalog_offers_each_mixin_once_from_the_newest_release() {
    if !snapshot_available() {
        println!("skipping: no fetched snapshot (run a build first)");
        return;
    }
    let count =
        super::bundled::load_bundled_mixins(&bundle()).expect("snapshot exists and is readable");
    assert!(count > 0, "the bundled snapshot is empty");
    let catalog = super::bundled::bundled_catalog();
    assert!(catalog.warnings.is_empty(), "{:?}", catalog.warnings);
    let names: Vec<_> = catalog.kits.iter().map(|k| k.name.as_str()).collect();
    let mut unique = names.clone();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(
        names.len(),
        unique.len(),
        "duplicate mixin names: {names:?}"
    );
    for kit in &catalog.kits {
        assert_eq!(kit.provider_id, "nikcio-docker-sandboxing");
        assert_eq!(kit.kind, "mixin");
        assert!(
            kit.source
                .starts_with("git+https://github.com/nikcio/docker-sandboxing.git#ref="),
            "unexpected source {}",
            kit.source
        );
        // The dir fragment is repository-relative (not bundle-relative) and
        // uses the same form-encoding as live discovery, which percent-encodes
        // the slash — sbx resolves it inside the repository.
        let dir = kit.source.split("&dir=").nth(1).unwrap_or_default();
        assert!(
            dir.starts_with("mixins%2F") && !dir.contains("spec.yaml"),
            "dir must point at the repository's mixin directory: {}",
            kit.source
        );
    }
    let go = catalog
        .kits
        .iter()
        .find(|k| k.name == "go")
        .expect("go mixin is bundled in every snapshot release");
    assert!(
        go.source.contains(&commit_of("v3.0.0")[..8]),
        "go must come from the newest bundled release, got {}",
        go.source
    );
}

#[test]
fn snapshot_matches_the_listed_releases() {
    if !snapshot_available() {
        println!("skipping: no fetched snapshot (run a build first)");
        return;
    }
    // Verify the fetched snapshot against the live releases. A diff means the
    // fetch produced stale or partial content — clear target/snapshot and
    // rebuild.
    let client = reqwest::blocking::Client::builder()
        .user_agent("Sandy/0.1 (public sandbox-kit discovery)")
        .build()
        .unwrap();
    for (tag, _) in BUNDLED_RELEASES {
        let mut mixin_names = github_tree(&client, tag);
        mixin_names.sort();
        let mut bundled: Vec<String> = std::fs::read_dir(bundle().join(tag))
            .expect("fetched release directory")
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        bundled.sort();
        assert_eq!(
            bundled, mixin_names,
            "fetched {tag} mixins do not match {RAW}; clear target/snapshot and rebuild"
        );
        for name in &bundled {
            let path = bundle().join(tag).join(name).join("spec.yaml");
            let live = fetch(&client, &format!("{RAW}/{tag}/mixins/{name}/spec.yaml"));
            let fetched = std::fs::read_to_string(&path).expect("fetched descriptor");
            assert_eq!(
                fetched,
                live,
                "{} does not match {RAW}; clear target/snapshot and rebuild",
                path.display()
            );
        }
    }
}

#[test]
fn discovery_falls_back_to_bundled_mixins_for_the_default_provider() {
    if !snapshot_available() {
        println!("skipping: no fetched snapshot (run a build first)");
        return;
    }
    // Reload the snapshot so this test does not depend on test execution order
    // (the snapshot is process-global state).
    super::bundled::load_bundled_mixins(&bundle()).unwrap();
    let provider = Provider {
        id: "nikcio-docker-sandboxing".into(),
        label: "nikcio/docker-sandboxing".into(),
        kind: "github".into(),
        repository: "nikcio/docker-sandboxing".into(),
        reference: String::new(),
        enabled: true,
    };
    // Live discovery found nothing (rate limit, offline): the fallback must
    // step in and add a re-keyed, deduped mixin list.
    let mut catalog = Catalog::default();
    super::merge_bundled_mixins(&mut catalog, std::slice::from_ref(&provider));
    assert!(
        !catalog.kits.is_empty(),
        "bundled fallback offered no mixins"
    );
    assert!(
        catalog
            .kits
            .iter()
            .all(|kit| kit.id.starts_with("bundled:nikcio-docker-sandboxing:"))
    );
    assert!(
        catalog
            .warnings
            .iter()
            .any(|w| w.contains("bundled offline snapshot"))
    );

    // Live mixins win: nothing bundled may be added on top.
    let mut live = Catalog::default();
    live.kits.push(super::KitOption {
        id: format!("{}:live", provider.id),
        name: "go".into(),
        description: String::new(),
        source: "git+https://github.com/nikcio/docker-sandboxing.git#ref=live&dir=mixins/go".into(),
        schema_version: 2,
        kind: "mixin".into(),
        provider_id: provider.id.clone(),
        required_agent: None,
        arguments: Vec::new(),
    });
    super::merge_bundled_mixins(&mut live, std::slice::from_ref(&provider));
    assert_eq!(live.kits.len(), 1, "live results must not be shadowed");
    assert!(live.warnings.is_empty(), "{:?}", live.warnings);

    // A different repository gets no fallback at all.
    let other = Provider {
        id: "other".into(),
        label: "Other kits".into(),
        kind: "github".into(),
        repository: "owner/repo".into(),
        reference: String::new(),
        enabled: true,
    };
    let mut empty = Catalog::default();
    super::merge_bundled_mixins(&mut empty, std::slice::from_ref(&other));
    assert!(empty.kits.is_empty());

    // A disabled provider gets no fallback: its sources cannot be authorized
    // at launch, so offering its mixins would dead-end the user.
    let disabled = Provider {
        id: "nikcio-docker-sandboxing".into(),
        label: "nikcio/docker-sandboxing".into(),
        kind: "github".into(),
        repository: "nikcio/docker-sandboxing".into(),
        reference: String::new(),
        enabled: false,
    };
    let mut disabled_catalog = Catalog::default();
    super::merge_bundled_mixins(&mut disabled_catalog, std::slice::from_ref(&disabled));
    assert!(disabled_catalog.kits.is_empty());
}

fn commit_of(tag: &str) -> String {
    BUNDLED_RELEASES
        .iter()
        .find(|(release, _)| *release == tag)
        .map(|(_, commit)| commit.to_string())
        .expect("release listed in BUNDLED_RELEASES")
}

fn github_tree(client: &reqwest::blocking::Client, tag: &str) -> Vec<String> {
    let api = format!("https://api.github.com/repos/{REPOSITORY}/commits/{tag}");
    let value: serde_json::Value =
        serde_json::from_str(&fetch(client, &api)).expect("valid JSON from the commits API");
    let commit = value["sha"].as_str().expect("commit sha").to_string();
    assert_eq!(
        commit,
        commit_of(tag),
        "the pinned commit for {tag} no longer matches the live tag"
    );
    let tree: serde_json::Value = serde_json::from_str(&fetch(
        client,
        &format!("https://api.github.com/repos/{REPOSITORY}/git/trees/{commit}?recursive=1"),
    ))
    .unwrap();
    tree["tree"]
        .as_array()
        .expect("GitHub tree response has entries")
        .iter()
        .filter_map(|entry| entry["path"].as_str())
        .filter_map(|path| {
            let mut parts = path.split('/');
            match (parts.next(), parts.next(), parts.next(), parts.next()) {
                (Some("mixins"), Some(name), Some("spec.yaml"), None) if !name.is_empty() => {
                    Some(name.to_string())
                }
                _ => None,
            }
        })
        .collect()
}

fn fetch(client: &reqwest::blocking::Client, url: &str) -> String {
    // Test-only fetch with the same UA the discovery client sends.
    client
        .get(url)
        .send()
        .unwrap()
        .error_for_status()
        .unwrap()
        .text()
        .unwrap()
}

// Keep `encoded` linked: the kit sources the catalog builds use the same
// encoding as live discovery.
const _: fn(&str) -> String = encoded;
