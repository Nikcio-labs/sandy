//! Persisted environment library. All paths are supplied by the caller (Tauri's
//! AppHandle.path().app_data_dir()); tests use isolated temporary directories.
//! `launch_template` creates when needed, then starts the sandbox without attaching.
//!
//! The environment schema remains "1" for both kit generations. Custom v2
//! agents and v3 workloads register their name via kits; built-in v2 shortcuts
//! need only agent=name. See Docker's configuration/environment-files reference.
//! `sbx env create --help` verifies --force, --name, and file PATH support;
//! it explicitly directs callers to env run to attach afterward.
//!
//! Templates may omit the workspace entirely: the sandbox is then mountless,
//! with no host bind mount, isolated from the host file system.

mod launch;
mod library;
mod schema;
mod source_policy;
mod validation;

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;

pub use launch::launch_template;
pub use library::{
    SaveTemplateRequest, SavedTemplate, TemplateDetails, UpdateTemplateRequest, delete_template,
    list_templates, read_template_details, save_template, template_warnings, update_template,
};

use std::sync::Mutex;

use tauri_plugin_dialog::DialogExt;

use self::validation::{path_string, strip_verbatim};

static LIBRARY: Mutex<()> = Mutex::new(());
static SOURCE_POLICY: Mutex<()> = Mutex::new(());

pub fn pick_workspace(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_title("Choose the sandbox workspace")
        .blocking_pick_folder();
    path.map(|path| match path.into_path() {
        Ok(path) => path_string(&strip_verbatim(&path)),
        Err(error) => Err(error.to_string()),
    })
    .transpose()
}

pub fn pick_template_path(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_title("Save the environment template outside your workspace")
        .set_file_name("sbxenv.yaml")
        .add_filter("Environment YAML", &["yaml", "yml"])
        .blocking_save_file();
    path.map(|path| match path.into_path() {
        Ok(path) => path_string(&strip_verbatim(&path)),
        Err(error) => Err(error.to_string()),
    })
    .transpose()
}
