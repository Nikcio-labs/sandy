// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.

use std::collections::BTreeMap;
use std::path::PathBuf;

use super::LIBRARY;
use super::launch::launch_template;
use super::launch::{SandboxRuntime, launch_with};
use super::library::{
    SaveTemplateRequest, UpdateTemplateRequest, delete_template, list_templates,
    read_template_details, register_template, save_template, template_warnings, update_template,
};
use super::schema::Environment;
use super::source_policy::{allow_source_with, prefix_matches};
use super::validation::path_string;
use crate::catalog::{KitArgument, KitOption, Provider, unique_id};
use crate::progress::LaunchProgress;

/// Collects the phases reported during a launch so tests can assert on the
/// progress sequence the frontend will render.
#[derive(Default)]
struct ProgressLog(Vec<LaunchProgress>);

impl ProgressLog {
    fn sink(&mut self) -> impl FnMut(LaunchProgress) + '_ {
        |progress| self.0.push(progress)
    }
}

#[derive(Default)]
struct MockRuntime {
    calls: Vec<Vec<String>>,
    existing: bool,
    fail_create: bool,
    fail_start: bool,
}

fn assert_library_available() {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while LIBRARY.try_lock().is_err() {
        assert!(
            std::time::Instant::now() < deadline,
            "library lock held during CLI work"
        );
        std::thread::yield_now();
    }
}

impl SandboxRuntime for MockRuntime {
    fn run(&mut self, args: &[&str]) -> Result<String, String> {
        assert_library_available();
        self.calls
            .push(args.iter().map(|arg| arg.to_string()).collect());
        if self.fail_create {
            return Err("create failed".into());
        }
        Ok("created".into())
    }

    fn exists(&mut self, name: &str) -> Result<bool, String> {
        assert_library_available();
        self.calls.push(vec!["exists".into(), name.into()]);
        Ok(self.existing)
    }

    fn start(&mut self, name: &str) -> Result<String, String> {
        assert_library_available();
        self.calls.push(vec![
            "run".into(),
            "--detach".into(),
            "--name".into(),
            name.into(),
        ]);
        if self.fail_start {
            return Err("start failed".into());
        }
        Ok("started".into())
    }

    fn create_streaming(
        &mut self,
        args: &[&str],
        line: &mut dyn FnMut(&str),
    ) -> Result<String, String> {
        if !self.fail_create {
            line("pulling docker.io/team/claude:1.0");
        }
        self.run(args)
    }
}

struct Fixture {
    base: PathBuf,
    root: PathBuf,
    workspace: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!("sandy-env-{}", unique_id()));
        let root = base.join("app-data");
        let workspace = base.join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        Self {
            base,
            root,
            workspace,
        }
    }
    fn request(&self) -> SaveTemplateRequest {
        SaveTemplateRequest {
            name: "example".into(),
            workspace: path_string(&self.workspace).unwrap(),
            agent: kit("claude", "agent", 2, "builtin"),
            mixins: vec![],
            arguments: BTreeMap::new(),
            save_path: None,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.base);
    }
}
fn kit(name: &str, kind: &str, version: u8, provider: &str) -> KitOption {
    KitOption {
        id: name.into(),
        name: name.into(),
        description: String::new(),
        source: if provider == "builtin" {
            name.into()
        } else {
            format!("docker.io/team/{name}:1.0")
        },
        schema_version: version,
        kind: kind.into(),
        provider_id: provider.into(),
        required_agent: None,
        arguments: vec![],
    }
}

#[test]
fn rejects_version_mixing_required_agent_and_duplicate_names() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    request.mixins.push(kit("browser", "mixin", 3, "hub"));
    assert!(
        save_template(&fixture.root, request.clone())
            .unwrap_err()
            .contains("cannot be combined")
    );
    request.mixins[0].schema_version = 2;
    request.mixins[0].required_agent = Some("codex".into());
    assert!(
        save_template(&fixture.root, request.clone())
            .unwrap_err()
            .contains("requires agent codex")
    );
    request.mixins[0] = kit("claude", "mixin", 2, "hub");
    assert!(
        save_template(&fixture.root, request)
            .unwrap_err()
            .contains("unique")
    );
}

#[test]
fn structural_yaml_arguments_and_custom_agent_sources_round_trip() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    request.agent = kit("custom", "agent", 2, "hub");
    request.agent.arguments.push(KitArgument {
        name: "message".into(),
        description: String::new(),
        required: true,
        default: None,
        choices: vec![],
    });
    let value = "true: 'quoted'\nnew: [items]\\\"${{ env.args.not_an_expression }}";
    request.arguments.insert(
        "custom".into(),
        BTreeMap::from([("message".into(), value.into())]),
    );
    let saved = save_template(&fixture.root, request).unwrap();
    let environment: Environment = serde_yaml_ng::from_str(&saved.content).unwrap();
    assert_eq!(environment.schema_version, "1");
    assert_eq!(environment.agent, "custom");
    assert_eq!(environment.kits[0].source(), "docker.io/team/custom:1.0");
    assert_eq!(environment.kits[0].arguments()["message"], value);
    assert_eq!(
        list_templates(&fixture.root).unwrap()[0].content,
        saved.content
    );
}

#[test]
fn v3_workload_is_first_kit_and_persistence_reads_disk() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    request.agent = kit("sbx-kit-claude", "workload", 3, "hub");
    request.mixins.push(kit("browser", "mixin", 3, "hub"));
    let saved = save_template(&fixture.root, request).unwrap();
    let environment: Environment = serde_yaml_ng::from_str(&saved.content).unwrap();
    assert_eq!(environment.kits.len(), 2);
    assert_eq!(
        environment.kits[0].source(),
        "docker.io/team/sbx-kit-claude:1.0"
    );
    std::fs::write(
        &saved.path,
        saved.content.replace("name: example", "name: changed"),
    )
    .unwrap();
    assert_eq!(list_templates(&fixture.root).unwrap()[0].name, "changed");
    std::fs::remove_file(&saved.path).unwrap();
    assert!(list_templates(&fixture.root).unwrap().is_empty());
    let warnings = template_warnings(&fixture.root).unwrap();
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains(&saved.path));
}

#[test]
fn stale_template_does_not_hide_readable_library_entries() {
    let fixture = Fixture::new();
    let readable = save_template(&fixture.root, fixture.request()).unwrap();
    let invalid = save_template(&fixture.root, fixture.request()).unwrap();
    std::fs::write(&invalid.path, "invalid: [yaml").unwrap();

    let templates = list_templates(&fixture.root).unwrap();
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].id, readable.id);
    let warnings = template_warnings(&fixture.root).unwrap();
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains(&invalid.path));
    assert!(warnings[0].contains("invalid environment YAML"));
}

#[test]
fn delete_template_removes_record_file_and_empty_library_directory() {
    let fixture = Fixture::new();
    let library_owned = save_template(&fixture.root, fixture.request()).unwrap();
    let mut custom = fixture.request();
    let custom_directory = fixture.base.join("custom");
    std::fs::create_dir(&custom_directory).unwrap();
    custom.save_path = Some(path_string(&custom_directory.join("sbxenv.yaml")).unwrap());
    let custom = save_template(&fixture.root, custom).unwrap();

    delete_template(&fixture.root, &library_owned.id).unwrap();
    assert!(!std::fs::exists(&library_owned.path).unwrap());
    assert!(
        !fixture
            .root
            .join("templates")
            .join(&library_owned.id)
            .exists()
    );
    let remaining = list_templates(&fixture.root).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, custom.id);
    assert!(template_warnings(&fixture.root).unwrap().is_empty());

    // Custom-location files are deleted too, and a missing file is already
    // gone: the stale record is still removed.
    delete_template(&fixture.root, &custom.id).unwrap();
    assert!(!std::fs::exists(&custom.path).unwrap());
    assert!(list_templates(&fixture.root).unwrap().is_empty());
    assert!(template_warnings(&fixture.root).unwrap().is_empty());

    assert_eq!(
        delete_template(&fixture.root, "unknown-id").unwrap_err(),
        "Unknown saved template"
    );
}

#[test]
fn prevents_workspace_files_and_overwrite() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    request.save_path = Some(path_string(&fixture.workspace.join("sbxenv.yaml")).unwrap());
    assert!(
        save_template(&fixture.root, request.clone())
            .unwrap_err()
            .contains("outside")
    );
    let existing = fixture.base.join("important.yaml");
    std::fs::write(&existing, "important").unwrap();
    request.save_path = Some(path_string(&existing).unwrap());
    assert!(
        save_template(&fixture.root, request)
            .unwrap_err()
            .contains("never overwritten")
    );
    assert_eq!(std::fs::read_to_string(existing).unwrap(), "important");
}

#[test]
fn registered_templates_launch_without_provider_authorization_and_stay_untouched() {
    let fixture = Fixture::new();
    // A hand-written environment file like a user would already have: OCI
    // sources Sandy has no provider record for, plus a mountless workspace.
    let file = fixture.base.join("my-stack").join("sbxenv.yaml");
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    let yaml = "schemaVersion: \"1\"\nname: my-stack\nagent: claude\nkits:\n  - docker.io/team/claude:1.0\n  - source: docker.io/team/browser:1.0\n    args:\n      region: eu\n";
    std::fs::write(&file, yaml).unwrap();
    let before = std::fs::read_to_string(&file).unwrap();

    let registered = register_template(&fixture.root, path_string(&file).unwrap()).unwrap();
    assert!(registered.registered);
    assert_eq!(registered.name, "my-stack");
    assert_eq!(registered.agent, "claude");
    assert_eq!(registered.workspace, "");
    assert_eq!(registered.kit_version, 2);
    assert_eq!(registered.content, yaml);
    assert_eq!(registered.path, path_string(&file).unwrap());

    // Listed like any other template, and launching skips provider
    // authorization: sbx enforces its own source policy at create time.
    let listed = list_templates(&fixture.root).unwrap();
    assert_eq!(listed.len(), 1);
    assert!(listed[0].registered);
    let mut runtime = MockRuntime::default();
    let result = launch_with(
        &fixture.root,
        &registered.id,
        None,
        None,
        &mut runtime,
        &mut |_| {},
    )
    .unwrap();
    assert!(result.contains("Created and started sandbox my-stack"));
    // No `settings` calls: no provider authorization was attempted.
    assert_eq!(runtime.calls[0], ["exists", "my-stack"]);
    let launch: Environment =
        serde_yaml_ng::from_str(&std::fs::read_to_string(&runtime.calls[1][5]).unwrap()).unwrap();
    assert_eq!(launch.kits.len(), 2);
    assert_eq!(launch.kits[0].source(), "docker.io/team/claude:1.0");
    assert_eq!(launch.kits[1].arguments()["region"], "eu");

    // The file is never rewritten by Sandy: editing is refused, updating is
    // refused, and delete only forgets the registration.
    let details_error = read_template_details(&fixture.root, &registered.id).unwrap_err();
    assert!(details_error.contains("registered from a local file"));
    let update = UpdateTemplateRequest {
        name: "renamed".into(),
        workspace: String::new(),
        agent: saved_agent(),
        mixins: vec![],
        arguments: BTreeMap::new(),
    };
    assert!(
        update_template(&fixture.root, &registered.id, update)
            .unwrap_err()
            .contains("registered from a local file")
    );
    assert_eq!(std::fs::read_to_string(&file).unwrap(), before);
    delete_template(&fixture.root, &registered.id).unwrap();
    assert!(std::fs::exists(&file).unwrap());
    assert_eq!(std::fs::read_to_string(&file).unwrap(), before);
    assert!(list_templates(&fixture.root).unwrap().is_empty());

    // Re-registering after forgetting works, but duplicates do not.
    register_template(&fixture.root, path_string(&file).unwrap()).unwrap();
    assert_eq!(
        register_template(&fixture.root, path_string(&file).unwrap()).unwrap_err(),
        format!("{} is already in the template library", file.display())
    );
}

#[test]
fn register_template_rejects_missing_and_invalid_files() {
    let fixture = Fixture::new();
    let missing = fixture.base.join("missing").join("sbxenv.yaml");
    assert!(
        register_template(&fixture.root, path_string(&missing).unwrap())
            .unwrap_err()
            .contains("not a file")
    );
    assert!(
        register_template(&fixture.root, "relative/sbxenv.yaml".into())
            .unwrap_err()
            .contains("absolute")
    );
    let file = fixture.base.join("broken.yaml");
    std::fs::write(&file, "invalid: [yaml").unwrap();
    assert!(
        register_template(&fixture.root, path_string(&file).unwrap())
            .unwrap_err()
            .contains("invalid environment YAML")
    );
    let unnamed = fixture.base.join("unnamed.yaml");
    std::fs::write(
        &unnamed,
        "schemaVersion: \"1\"\nname: not_a_valid name!\nagent: claude\n",
    )
    .unwrap();
    assert!(
        register_template(&fixture.root, path_string(&unnamed).unwrap())
            .unwrap_err()
            .contains("Environment name")
    );
    // A Sandy-saved template cannot be registered twice through the picker.
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    assert!(
        register_template(&fixture.root, saved.path)
            .unwrap_err()
            .contains("already in the template library")
    );
}

#[test]
fn registered_directory_template_warns_when_file_disappears() {
    let fixture = Fixture::new();
    let file = fixture.base.join("external.yaml");
    std::fs::write(
        &file,
        "schemaVersion: \"1\"\nname: external\nagent: claude\n",
    )
    .unwrap();
    let registered = register_template(&fixture.root, path_string(&file).unwrap()).unwrap();
    std::fs::remove_file(&file).unwrap();
    assert!(list_templates(&fixture.root).unwrap().is_empty());
    let warnings = template_warnings(&fixture.root).unwrap();
    assert_eq!(warnings.len(), 1);
    assert!(warnings[0].contains(&registered.path));
}

#[test]
fn launches_noninteractively_with_name_workspace_override_and_no_mutation() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let other = fixture.base.join("other workspace");
    std::fs::create_dir(&other).unwrap();
    let mut runtime = MockRuntime::default();
    let mut progress = ProgressLog::default();
    let result = launch_with(
        &fixture.root,
        &saved.id,
        Some("second".into()),
        Some(path_string(&other).unwrap()),
        &mut runtime,
        &mut progress.sink(),
    )
    .unwrap();
    assert!(result.contains("Created and started sandbox second"));
    assert_eq!(runtime.calls[0], ["exists", "second"]);
    assert_eq!(
        &runtime.calls[1][..5],
        ["env", "create", "--force", "--name", "second"]
    );
    assert_eq!(runtime.calls[2], ["run", "--detach", "--name", "second"]);
    assert_eq!(
        progress.0,
        [
            LaunchProgress::Preparing,
            LaunchProgress::Output {
                line: "pulling docker.io/team/claude:1.0".into(),
            },
            LaunchProgress::Starting,
            LaunchProgress::Ready,
        ]
    );
    let launch: Environment =
        serde_yaml_ng::from_str(&std::fs::read_to_string(&runtime.calls[1][5]).unwrap()).unwrap();
    assert_eq!(
        launch.workspace.unwrap().path(),
        path_string(&other).unwrap()
    );
    assert_eq!(std::fs::read_to_string(saved.path).unwrap(), saved.content);
}

#[test]
fn existing_sandbox_is_resumed_without_recreating_environment() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let mut runtime = MockRuntime {
        existing: true,
        ..Default::default()
    };
    let result = launch_with(
        &fixture.root,
        &saved.id,
        None,
        None,
        &mut runtime,
        &mut |_| {},
    )
    .unwrap();
    assert!(result.contains("Started existing sandbox example"));
    assert_eq!(
        runtime.calls,
        [
            vec!["exists", "example"],
            vec!["run", "--detach", "--name", "example"]
        ]
    );
    assert!(!fixture.root.join("launches").exists());
}

#[test]
fn create_failure_does_not_attempt_to_start() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let mut runtime = MockRuntime {
        fail_create: true,
        ..Default::default()
    };
    let error = launch_with(
        &fixture.root,
        &saved.id,
        None,
        None,
        &mut runtime,
        &mut |_| {},
    )
    .unwrap_err();
    assert!(error.contains("Environment creation failed"));
    assert_eq!(runtime.calls.len(), 2);
}

#[test]
fn update_template_rewrites_file_and_record_in_place() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let mut browser = kit("browser", "mixin", 2, "hub");
    browser.arguments.push(KitArgument {
        name: "region".into(),
        description: String::new(),
        required: false,
        default: None,
        choices: vec![],
    });
    let update = UpdateTemplateRequest {
        name: "renamed".into(),
        workspace: path_string(&fixture.workspace).unwrap(),
        agent: saved_agent(),
        mixins: vec![browser],
        arguments: BTreeMap::from([(
            "browser".into(),
            BTreeMap::from([("region".into(), "eu".into())]),
        )]),
    };
    let updated = update_template(&fixture.root, &saved.id, update).unwrap();
    assert_eq!(updated.id, saved.id);
    assert_eq!(updated.name, "renamed");
    assert_eq!(updated.path, saved.path);
    assert_eq!(updated.agent, "claude");
    // Same file, rewritten content: the record and YAML stay in sync. The
    // built-in agent contributes no kit entry; only the mixin is listed.
    let content = std::fs::read_to_string(&saved.path).unwrap();
    let environment: Environment = serde_yaml_ng::from_str(&content).unwrap();
    assert_eq!(environment.name, "renamed");
    assert_eq!(environment.kits.len(), 1);
    assert_eq!(environment.kits[0].source(), "docker.io/team/browser:1.0");
    assert_eq!(environment.kits[0].arguments()["region"], "eu");
    let listed = list_templates(&fixture.root).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, saved.id);
    assert_eq!(listed[0].name, "renamed");
    assert!(template_warnings(&fixture.root).unwrap().is_empty());
}

fn saved_agent() -> crate::catalog::KitOption {
    kit("claude", "agent", 2, "builtin")
}

#[test]
fn update_template_validates_like_save_and_keeps_location_on_failure() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    // A v2 agent cannot mix with a v3 mixin.
    let update = UpdateTemplateRequest {
        name: "renamed".into(),
        workspace: String::new(),
        agent: saved_agent(),
        mixins: vec![kit("browser", "mixin", 3, "hub")],
        arguments: BTreeMap::new(),
    };
    assert!(
        update_template(&fixture.root, &saved.id, update)
            .unwrap_err()
            .contains("cannot be combined")
    );
    // The failed update leaves the saved template untouched.
    assert_eq!(std::fs::read_to_string(&saved.path).unwrap(), saved.content);
    let listed = list_templates(&fixture.root).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].name, "example");
    // Unknown ids are rejected, mirroring delete_template.
    let update = UpdateTemplateRequest {
        name: "renamed".into(),
        workspace: String::new(),
        agent: saved_agent(),
        mixins: vec![],
        arguments: BTreeMap::new(),
    };
    assert_eq!(
        update_template(&fixture.root, "unknown-id", update).unwrap_err(),
        "Unknown saved template"
    );
}

#[test]
fn template_details_expose_kit_metadata_and_pinned_arguments() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    request.agent = kit("custom", "agent", 2, "hub");
    request.agent.arguments.push(KitArgument {
        name: "message".into(),
        description: String::new(),
        required: false,
        default: None,
        choices: vec![],
    });
    let mut browser = kit("browser", "mixin", 2, "hub");
    browser.arguments.push(KitArgument {
        name: "region".into(),
        description: String::new(),
        required: false,
        default: None,
        choices: vec![],
    });
    request.mixins.push(browser);
    request.arguments.insert(
        "custom".into(),
        BTreeMap::from([("message".into(), "hello".into())]),
    );
    request.arguments.insert(
        "browser".into(),
        BTreeMap::from([("region".into(), "eu".into())]),
    );
    let saved = save_template(&fixture.root, request).unwrap();
    let details = read_template_details(&fixture.root, &saved.id).unwrap();
    assert_eq!(details.template.id, saved.id);
    assert_eq!(details.agent.id, "custom");
    assert_eq!(details.mixins.len(), 1);
    // Arguments are keyed by kit id, ready for the wizard's values state.
    assert_eq!(details.arguments["custom"]["message"], "hello");
    assert_eq!(details.arguments["browser"]["region"], "eu");
    assert_eq!(
        read_template_details(&fixture.root, "unknown-id").unwrap_err(),
        "Unknown saved template"
    );
}

#[test]
fn launch_failure_reports_created_environment_and_retry_command() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let mut runtime = MockRuntime {
        fail_start: true,
        ..Default::default()
    };
    let error = launch_with(
        &fixture.root,
        &saved.id,
        None,
        None,
        &mut runtime,
        &mut |_| {},
    )
    .unwrap_err();
    assert!(error.contains("was created, but it could not be started"));
    assert!(error.contains("sbx run --detach --name example"));
    assert_eq!(runtime.calls.len(), 3);
    assert_eq!(std::fs::read_to_string(saved.path).unwrap(), saved.content);
}

#[test]
#[cfg(unix)]
fn production_launch_starts_through_sbx_and_resumes_without_create() {
    use std::os::unix::fs::PermissionsExt;

    struct RestorePath(Option<std::ffi::OsString>);
    impl Drop for RestorePath {
        fn drop(&mut self) {
            if let Some(path) = &self.0 {
                crate::sbx::test_env::set_var("PATH", path);
            } else {
                crate::sbx::test_env::remove_var("PATH");
            }
        }
    }

    let _guard = crate::sbx::test_env::CLI_TEST_ENV_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let executable = fixture.base.join("sbx");
    std::fs::write(
        &executable,
        r#"#!/bin/sh
base="${0%/*}"
printf '%s\n' "$*" >> "$base/commands"
case "$1" in
  ls)
if [ -f "$base/created" ]; then
  printf '%s\n' '[{"name":"example"}]'
else
  printf '%s\n' '[]'
fi
;;
  env)
[ "$2" = create ] || exit 1
: > "$base/created"
printf '%s\n' 'created'
;;
  run) printf '%s\n' 'started' ;;
  *) exit 1 ;;
esac
"#,
    )
    .unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
    let restore = RestorePath(std::env::var_os("PATH"));
    let path = std::env::join_paths(std::iter::once(fixture.base.clone()).chain(
        std::env::split_paths(restore.0.as_deref().unwrap_or_default()),
    ))
    .unwrap();
    crate::sbx::test_env::set_var("PATH", path);

    let created = launch_template(&fixture.root, &saved.id, None, None, &mut |_| {}).unwrap();
    assert!(created.contains("Created and started sandbox example"));
    let resumed = launch_template(&fixture.root, &saved.id, None, None, &mut |_| {}).unwrap();
    assert!(resumed.contains("Started existing sandbox example"));
    let commands = std::fs::read_to_string(fixture.base.join("commands")).unwrap();
    let commands: Vec<_> = commands.lines().collect();
    assert_eq!(commands.len(), 7, "{commands:?}");
    assert_eq!(commands[0], "ls --json");
    assert!(commands[1].starts_with("env create --force --name example "));
    assert_eq!(commands[2], "ls --json");
    assert_eq!(commands[3], "run --detach --name example");
    assert_eq!(commands[4], "ls --json");
    assert_eq!(commands[5], "ls --json");
    assert_eq!(commands[6], "run --detach --name example");
    assert_eq!(std::fs::read_to_string(saved.path).unwrap(), saved.content);
}

#[test]
fn source_authorization_merges_and_rejects_managed_policy() {
    let provider = Provider {
        id: "custom".into(),
        label: "Custom".into(),
        kind: "github".into(),
        repository: "team/kits".into(),
        reference: "v1".into(),
        enabled: true,
    };
    let mut calls = Vec::new();
    allow_source_with(&provider, &mut |args| {
        calls.push(args.iter().map(|a| a.to_string()).collect::<Vec<_>>());
        Ok(match calls.len() {
            1 => r#"{"source":"override","value":["docker.io/","ghcr.io/trusted/"]}"#.into(),
            2 => String::new(),
            _ => r#"{"source":"override","value":["docker.io/","ghcr.io/trusted/","github.com/team/kits","github.com/team/kits.git"]}"#.into(),
        })
    }).unwrap();
    let prefixes: Vec<String> = serde_json::from_str(&calls[1][3]).unwrap();
    assert_eq!(
        prefixes,
        [
            "docker.io/",
            "ghcr.io/trusted/",
            "github.com/team/kits",
            "github.com/team/kits.git"
        ]
    );
    assert!(
        allow_source_with(&provider, &mut |_| Ok(
            r#"{"source":"envvar","value":["docker.io/"]}"#.into()
        ))
        .unwrap_err()
        .contains("administrator")
    );
    assert!(!prefix_matches(
        "github.com/team/kits",
        "github.com/team/kits-evil"
    ));
}

#[test]
fn canonicalized_paths_simplify_windows_verbatim_prefixes() {
    // Windows file pickers and std::fs::canonicalize produce verbatim paths
    // like \\?\C:\Users\name, which the sbx CLI rejects. Saving and launching
    // must convert them back to ordinary paths.
    let fixture = Fixture::new();
    let canonical = super::validation::canonicalize(&fixture.workspace).unwrap();
    assert!(!canonical.to_string_lossy().contains(r"\\?\"));
    assert!(canonical.is_dir());
    // A saved template's recorded workspace uses the simplified form too.
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    assert!(
        !saved.workspace.contains(r"\\?\"),
        "workspace was recorded verbatim: {}",
        saved.workspace
    );
    // Picker results are stripped even when the OS dialog returns verbatim
    // paths directly.
    let stripped = super::validation::strip_verbatim(std::path::Path::new(r"\\?\C:\Users\nikol"));
    assert_eq!(stripped, std::path::Path::new(r"C:\Users\nikol"));
    // Ordinary paths pass through unchanged.
    assert_eq!(
        super::validation::strip_verbatim(&fixture.workspace),
        fixture.workspace
    );
}

#[test]
fn mountless_templates_save_launch_and_stay_isolated() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    // An empty workspace opts out of host mounts entirely.
    request.workspace = "".into();
    let saved = save_template(&fixture.root, request).unwrap();
    assert_eq!(saved.workspace, "");
    let environment: Environment = serde_yaml_ng::from_str(&saved.content).unwrap();
    assert!(environment.workspace.is_none());
    assert!(!saved.content.contains("workspace"));

    let mut runtime = MockRuntime::default();
    let result = launch_with(
        &fixture.root,
        &saved.id,
        None,
        None,
        &mut runtime,
        &mut |_| {},
    )
    .unwrap();
    assert!(result.contains("Created and started sandbox example"));
    let launch: Environment =
        serde_yaml_ng::from_str(&std::fs::read_to_string(&runtime.calls[1][5]).unwrap()).unwrap();
    // The launch file stays mountless: no workspace field is written.
    assert!(launch.workspace.is_none());
    assert!(
        !std::fs::read_to_string(&runtime.calls[1][5])
            .unwrap()
            .contains("workspace")
    );
    // The saved template is never mutated.
    assert_eq!(std::fs::read_to_string(saved.path).unwrap(), saved.content);
}

#[test]
fn mountless_launch_ignores_workspace_override_and_launch_files() {
    let fixture = Fixture::new();
    let mut request = fixture.request();
    request.workspace = "".into();
    let saved = save_template(&fixture.root, request).unwrap();
    let mut runtime = MockRuntime::default();
    // An override against a mountless template cannot silently add a host
    // mount: isolation is the recorded configuration.
    launch_with(
        &fixture.root,
        &saved.id,
        Some("second".into()),
        Some(path_string(&fixture.workspace).unwrap()),
        &mut runtime,
        &mut |_| {},
    )
    .unwrap();
    let launch: Environment =
        serde_yaml_ng::from_str(&std::fs::read_to_string(&runtime.calls[1][5]).unwrap()).unwrap();
    assert!(launch.workspace.is_none());
    assert_eq!(launch.name, "second");
}

#[test]
fn mountless_launch_of_workspace_template_drops_the_mount_when_requested() {
    let fixture = Fixture::new();
    let saved = save_template(&fixture.root, fixture.request()).unwrap();
    let mut runtime = MockRuntime::default();
    // An explicit empty override opts out of the saved workspace mount.
    launch_with(
        &fixture.root,
        &saved.id,
        None,
        Some(String::new()),
        &mut runtime,
        &mut |_| {},
    )
    .unwrap();
    let launch: Environment =
        serde_yaml_ng::from_str(&std::fs::read_to_string(&runtime.calls[1][5]).unwrap()).unwrap();
    assert!(launch.workspace.is_none());
    // The saved template keeps its workspace.
    assert_eq!(std::fs::read_to_string(saved.path).unwrap(), saved.content);
}
