//! Launching a saved template: sandbox resume, workspace overrides, source
//! authorization, and non-interactive environment creation.

use std::collections::HashSet;
use std::io::Write;
use std::path::Path;

use crate::catalog::{get_providers, github_repository, unique_id};
use crate::progress::LaunchProgress;

use super::LIBRARY;
use super::library::{read_template, records};
use super::schema::{Workspace, escape};
use super::source_policy::allow_source_with;
use super::validation::{
    canonicalize, ensure_outside, path_string, selected, validate_name, workspace_path,
};

pub fn launch_template(
    root: &Path,
    id: &str,
    name: Option<String>,
    workspace: Option<String>,
    progress: &mut dyn FnMut(LaunchProgress),
) -> Result<String, String> {
    launch_with(root, id, name, workspace, &mut SbxRuntime, progress)
}

pub(super) trait SandboxRuntime {
    fn run(&mut self, args: &[&str]) -> Result<String, String>;
    fn exists(&mut self, name: &str) -> Result<bool, String>;
    fn start(&mut self, name: &str) -> Result<String, String>;
    fn create_streaming(
        &mut self,
        dir: Option<&Path>,
        args: &[&str],
        line: &mut dyn FnMut(&str),
    ) -> Result<String, String>;
}

struct SbxRuntime;

impl SandboxRuntime for SbxRuntime {
    fn run(&mut self, args: &[&str]) -> Result<String, String> {
        crate::sbx::run_capture(args)
    }

    fn exists(&mut self, name: &str) -> Result<bool, String> {
        Ok(crate::sbx::list_sandboxes()?
            .iter()
            .any(|sandbox| sandbox.name == name))
    }

    fn start(&mut self, name: &str) -> Result<String, String> {
        crate::sbx::start_sandbox(name)
    }

    fn create_streaming(
        &mut self,
        dir: Option<&Path>,
        args: &[&str],
        line: &mut dyn FnMut(&str),
    ) -> Result<String, String> {
        match dir {
            Some(dir) => crate::sbx::run_capture_lines_in(dir, args, line),
            None => crate::sbx::run_capture_lines(args, line),
        }
    }
}

pub(super) fn launch_with(
    root: &Path,
    id: &str,
    name: Option<String>,
    workspace: Option<String>,
    runtime: &mut impl SandboxRuntime,
    progress: &mut dyn FnMut(LaunchProgress),
) -> Result<String, String> {
    let (record, saved, environment) = {
        let _guard = LIBRARY.lock().map_err(|e| e.to_string())?;
        let record = records(root)?
            .into_iter()
            .find(|r| r.id == id)
            .ok_or_else(|| format!("Unknown saved template: {id}"))?;
        let (saved, environment) = read_template(&record)?;
        (record, saved, environment)
    };
    let name = name.unwrap_or_else(|| saved.name.clone());
    validate_name(&name)?;
    // Resuming an existing name preserves its recorded configuration and does
    // not replay environment creation, host hooks, or source authorization.
    if runtime
        .exists(&name)
        .map_err(|error| format!("Cannot check whether sandbox {name} already exists:\n{error}"))?
    {
        progress(LaunchProgress::Starting);
        let output = runtime.start(&name).map_err(|error| {
            format!("Existing sandbox {name} could not be started. Retry with sbx run --detach --name {name}:\n{error}")
        })?;
        return Ok(format!(
            "Started existing sandbox {name} in the background using its existing agent, kits, and workspace.\n{output}"
        ));
    }
    // An empty workspace (saved or override) launches a mountless sandbox,
    // isolated from the host file system: no directory checks apply.
    // Registered templates may record a relative workspace (".", "./src", …):
    // sbx resolves it from the declaring file's directory, so the value
    // passes through instead of being turned into an absolute path here.
    let workspace_value = workspace.unwrap_or_else(|| saved.workspace.clone());
    let registered_launch = record.registered;
    let original = canonicalize(&record.path).map_err(|e| format!("{}: {e}", record.path))?;
    let template_directory = original
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", record.path))?;
    let workspace = if registered_launch {
        // The file is authoritative for a registered template: sbx resolves
        // relative workspaces from this directory, and sbx itself protects a
        // file mounted at a workspace root (read-only) while refusing deeper
        // placement. Sandy only validates an absolute workspace's shape.
        match workspace_value.trim() {
            "" => None,
            path if Path::new(path).is_absolute() => Some(workspace_path(path)?),
            _ => None,
        }
    } else {
        match workspace_value.trim() {
            "" => None,
            path => Some(workspace_path(path)?),
        }
    };
    if !registered_launch && let Some(workspace) = workspace.as_deref() {
        ensure_outside(&original, workspace)?;
    }
    let providers = get_providers(root)?;
    let mut authorized = HashSet::new();
    let mut authorized_any = false;
    for kit in selected(&record.agent, &record.mixins) {
        if let Some(url) = kit.source.strip_prefix("git+https://github.com/") {
            let repository = url
                .split('#')
                .next()
                .unwrap_or_default()
                .trim_end_matches(".git");
            let provider = providers
                .iter()
                .find(|p| {
                    p.enabled
                        && p.kind == "github"
                        && github_repository(&p.repository).is_ok_and(|r| r == repository)
                })
                .ok_or_else(|| {
                    format!(
                        "Enable the GitHub provider for {repository} before launching this template"
                    )
                })?;
            if authorized.insert(repository.to_string()) {
                authorized_any = true;
                progress(LaunchProgress::Authorizing);
                allow_source_with(provider, &mut |args| runtime.run(args))?;
            }
        } else if record.registered {
            // Registered templates reference kits Sandy never discovered, so
            // there is no provider record to authorize: sbx enforces its own
            // kit.allowedSources policy at create time.
            continue;
        } else {
            return Err(format!(
                "Unsupported saved source: {}. Select a kit from an enabled GitHub provider",
                kit.source
            ));
        }
    }
    // Registered templates run against their original file from its own
    // directory: relative kit and workspace paths resolve from the declaring
    // file's directory (workspace: "." is the file's folder), so copying the
    // YAML into Sandy's storage would silently retarget them. The file is the
    // user's, which also keeps it the single source of truth.
    let (create_directory, create_path) = if registered_launch {
        (Some(template_directory.to_path_buf()), original)
    } else {
        // Use an immutable per-launch snapshot, preserving the original file
        // and the sbx environment journal's file identity for later env
        // commands.
        let directory = root.join("launches").join(unique_id());
        let mut ancestor = directory.as_path();
        while !ancestor.exists() {
            ancestor = ancestor
                .parent()
                .ok_or("Launch directory has no existing parent")?;
        }
        if let Some(workspace) = workspace.as_deref() {
            ensure_outside(&canonicalize(ancestor)?, workspace)?;
        }
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let path = canonicalize(directory)?.join("sbxenv.yaml");
        if let Some(workspace) = workspace.as_deref() {
            ensure_outside(&path, workspace)?;
        }
        (None, path)
    };
    let path = match create_directory {
        None => {
            // Edit the decoded document so manually added environment settings survive.
            // Removing workspace launches a mountless sandbox with no host bind mount.
            let mut document: serde_yaml_ng::Value =
                serde_yaml_ng::from_str(&saved.content).map_err(|e| e.to_string())?;
            document["name"] = serde_yaml_ng::Value::String(name.clone());
            match (&environment.workspace, workspace) {
                (Some(Workspace::Object { path: _, clone }), Some(workspace)) => {
                    document["workspace"] = serde_yaml_ng::to_value(Workspace::Object {
                        path: escape(&path_string(workspace.as_path())?),
                        clone: *clone,
                    })
                    .map_err(|e| e.to_string())?;
                }
                (Some(_), Some(workspace)) => {
                    document["workspace"] =
                        serde_yaml_ng::Value::String(escape(&path_string(workspace.as_path())?));
                }
                (Some(_), None) => {
                    document
                        .as_mapping_mut()
                        .ok_or("Environment file is not a mapping")?
                        .remove("workspace");
                }
                // A mountless template cannot gain a workspace without re-saving:
                // mountless is the recorded isolation choice for this launch.
                (None, _) => {}
            }
            let content = serde_yaml_ng::to_string(&document).map_err(|e| e.to_string())?;
            let mut file = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&create_path)
                .map_err(|e| e.to_string())?;
            file.write_all(content.as_bytes())
                .and_then(|_| file.sync_all())
                .map_err(|e| e.to_string())?;
            create_path
        }
        // The original file keeps its own name and workspace field: sbx
        // applies --name and reads relative paths against this directory.
        Some(_) => create_path,
    };
    let path = path_string(&path)?;
    progress(if authorized_any {
        LaunchProgress::Creating
    } else {
        LaunchProgress::Preparing
    });
    let created = runtime
        .create_streaming(
            create_directory.as_deref(),
            &["env", "create", "--force", "--name", &name, &path],
            &mut |text| {
                progress(LaunchProgress::Output {
                    line: text.to_string(),
                });
            },
        )
        .map_err(|e| format!("Environment creation failed. Launch file retained at {path} for diagnostics and retry:\n{e}"))?;
    progress(LaunchProgress::Starting);
    let started = runtime.start(&name).map_err(|error| {
        format!("Environment {name} was created, but it could not be started. Retry with sbx run --detach --name {name}; launching this name again will resume it without recreating it.\nLaunch file: {path}\nCreate output: {created}\n{error}")
    })?;
    progress(LaunchProgress::Ready);
    Ok(format!(
        "Created and started sandbox {name} in the background without attaching an interactive session.\nLaunch file: {path}\n{created}\n{started}"
    ))
}
