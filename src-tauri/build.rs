//! Build script: prefetch the bundled mixin snapshot, then hand it to Tauri
//! as bundle resources.
//!
//! The snapshot is not committed to the repository. It is downloaded here on
//! (re)build from the releases listed in `RELEASES` — a refreshed snapshot
//! only means updating that table. The fetched copy lives under `target/`
//! (gitignored), so offline rebuilds reuse it instead of re-downloading.
//!
//! A build-script failure aborts the build, so panics and unwraps are the
//! correct failure mode here — the workspace lint denials don't apply.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Path, PathBuf};
use std::time::Duration;

/// The bundled releases as (tag, commit), newest first. The commit is the
/// source ref recorded in each kit's git source and the tree the snapshot is
/// read from. The same table is emitted as source for the catalog to include,
/// so the fetcher and the runtime always agree on the snapshot's contents.
const RELEASES: &[(&str, &str)] = &[
    ("v3.0.0", "0ed6b4533e82324e92d02c025946b7830eb452e2"),
    ("v2.3.0", "ee3edc28fc2a5bed3803819cee7e4f21d8d0b5c0"),
    ("v2.2.1", "71603a702b415d411c0bebebdfd296721e00ef7e"),
];

const REPOSITORY: &str = "nikcio/docker-sandboxing";

/// Where the fetched snapshot lives, relative to CARGO_MANIFEST_DIR. Must
/// match `bundle.resources` in tauri.conf.json.
const SNAPSHOT_DIR: &str = "target/snapshot/mixins";

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    prefetch(&manifest.join(SNAPSHOT_DIR));
    emit_release_table(&out);
    tauri_build::build();
}

fn prefetch(bundle: &Path) {
    // The fetched markers live outside `mixins/`: everything under the bundle
    // directory ships in the app resources, and the markers are build state,
    // not snapshot content.
    let markers = bundle.parent().unwrap_or(bundle).join("fetched");
    let mut missing = Vec::new();
    for (tag, _) in RELEASES {
        if !markers.join(tag).exists() {
            missing.push(*tag);
        }
    }
    if missing.is_empty() {
        return;
    }
    // Escape hatch for offline or reproducible builds: skip the fetch and
    // build without the runtime fallback (the app tolerates a missing
    // snapshot; discovery just has no offline mixins).
    if std::env::var("SANDY_SKIP_SNAPSHOT_FETCH").is_ok() {
        println!(
            "cargo:warning=SANDY_SKIP_SNAPSHOT_FETCH set; building without the bundled mixin snapshot"
        );
        return;
    }
    println!(
        "cargo:warning=fetching bundled mixin snapshot: {} release(s)",
        missing.len()
    );
    let client = reqwest::blocking::Client::builder()
        .user_agent("Sandy/0.1 (bundled mixin snapshot fetch)")
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_else(|error| panic!("cannot build the snapshot fetch client: {error}"));
    for tag in missing {
        let commit = release_commit(tag);
        // Fetch by commit, not tag: the commit is what every kit source cites
        // and what `.fetched` records, so a force-moved tag cannot make the
        // bundled content diverge from the recorded ref.
        for name in mixin_names(&client, commit) {
            let url = format!(
                "https://raw.githubusercontent.com/{REPOSITORY}/{commit}/mixins/{name}/spec.yaml"
            );
            let text = client
                .get(&url)
                .send()
                .and_then(|response| response.error_for_status())
                .and_then(|response| response.text())
                .unwrap_or_else(|error| panic!("cannot fetch {url}: {error}"));
            let directory = bundle.join(tag).join(&name);
            std::fs::create_dir_all(&directory)
                .unwrap_or_else(|error| panic!("cannot create {}: {error}", directory.display()));
            std::fs::write(directory.join("spec.yaml"), text)
                .unwrap_or_else(|error| panic!("cannot write {tag}/{name}/spec.yaml: {error}"));
        }
        std::fs::create_dir_all(&markers)
            .unwrap_or_else(|error| panic!("cannot create {}: {error}", markers.display()));
        std::fs::write(markers.join(tag), commit)
            .unwrap_or_else(|error| panic!("cannot mark {tag} fetched: {error}"));
    }
}

fn release_commit(tag: &str) -> &'static str {
    RELEASES
        .iter()
        .find(|(release, _)| *release == tag)
        .map(|(_, commit)| *commit)
        .unwrap_or_else(|| panic!("release {tag} has no pinned commit"))
}

/// The mixin directory names for a release, from the repository tree API.
fn mixin_names(client: &reqwest::blocking::Client, commit: &str) -> Vec<String> {
    let url = format!("https://api.github.com/repos/{REPOSITORY}/git/trees/{commit}?recursive=1");
    let response = client
        .get(&url)
        .send()
        .and_then(|response| response.error_for_status())
        .and_then(|response| response.json::<serde_json::Value>())
        .unwrap_or_else(|error| panic!("cannot list the snapshot tree: {error}"));
    let mut names = Vec::new();
    for entry in response["tree"].as_array().into_iter().flatten() {
        let path = entry["path"].as_str().unwrap_or_default();
        let mut parts = path.split('/');
        if let (Some("mixins"), Some(name), Some("spec.yaml"), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
            && !name.is_empty()
        {
            names.push(name.to_string());
        }
    }
    if names.is_empty() {
        panic!("the snapshot tree for {commit} lists no mixins");
    }
    names
}

/// Write the release table and repository as a source file the catalog
/// includes, so the fetcher and the runtime share one list.
fn emit_release_table(out: &Path) {
    let rows: Vec<String> = RELEASES
        .iter()
        .map(|(tag, commit)| format!("    (\"{tag}\", \"{commit}\"),\n"))
        .collect();
    let source = format!(
        "// generated by build.rs from RELEASES and REPOSITORY — do not edit\n\
         pub(crate) const REPOSITORY: &str = \"{REPOSITORY}\";\n\
         pub(crate) const BUNDLED_RELEASES: &[(&str, &str)] = &[\n{}];\n",
        rows.join("")
    );
    std::fs::write(out.join("bundled_releases.rs"), source)
        .unwrap_or_else(|error| panic!("cannot write the release table: {error}"));
}
