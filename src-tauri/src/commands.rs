//! Tauri command handlers. Each command is a thin wrapper that moves blocking
//! work onto Tauri's blocking worker pool; the domain logic lives in `sbx`,
//! `catalog`, `environments`, and `setup`.

use std::future::Future;
use std::path::PathBuf;

use tauri::Manager;

use crate::{catalog, environments, logging, sbx, setup};

/// Log every Tauri command outcome (command name, ok/error, and the error
/// text on failure). Successes carry no detail; the domain loggers already
/// recorded the underlying CLI/HTTP work.
async fn logged<T, E>(
    command: &'static str,
    work: impl Future<Output = Result<T, E>>,
) -> Result<T, E>
where
    E: std::fmt::Display,
{
    let result = work.await;
    logging::command_call(command, &result);
    result
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| error.to_string())?
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}
#[tauri::command]
async fn check_setup() -> Result<setup::SetupStatus, String> {
    logged(
        "check_setup",
        async move { blocking(setup::check_setup).await },
    )
    .await
}

/// Reveal the main window after first-run setup. Called from the setup
/// window, which would otherwise leave the app invisible behind its own
/// close; the splash is closed here too because the setup window may
/// finish without ever having shown itself (setup already complete).
#[tauri::command]
async fn reveal_main(app: tauri::AppHandle) -> Result<(), String> {
    logged("reveal_main", async move {
        let main = app
            .get_webview_window("main")
            .ok_or_else(|| "main window is missing".to_string())?;
        main.show().map_err(|error| error.to_string())?;
        main.set_focus().map_err(|error| error.to_string())?;
        if let Some(splash) = app.get_webview_window("splash") {
            let _ = splash.close();
        }
        Ok(())
    })
    .await
}

/// Close the boot splash. The setup window calls this before showing the
/// wizard: the splash is always-on-top and would cover it, and the setup
/// window's capability does not grant closing other windows.
#[tauri::command]
async fn close_splash(app: tauri::AppHandle) -> Result<(), String> {
    logged("close_splash", async move {
        if let Some(splash) = app.get_webview_window("splash") {
            let _ = splash.close();
        }
        Ok(())
    })
    .await
}

/// Reopen the setup window from the main window (e.g. the sandboxes page's
/// setup banner after the user skipped first-run setup). The setup window
/// re-runs its check when focused.
#[tauri::command]
async fn open_setup_window(app: tauri::AppHandle) -> Result<(), String> {
    logged("open_setup_window", async move {
        let setup = app
            .get_webview_window("setup")
            .ok_or_else(|| "setup window is missing".to_string())?;
        setup.show().map_err(|error| error.to_string())?;
        setup.set_focus().map_err(|error| error.to_string())
    })
    .await
}

/// Quit the app from the setup window's close button. Closing the window
/// alone would reveal the main window (the destroyed-window fallback), so
/// quitting must exit the whole process.
#[tauri::command]
async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    logged("quit_app", async move {
        app.exit(0);
        Ok(())
    })
    .await
}

#[tauri::command]
async fn open_installer_terminal() -> Result<(), String> {
    logged("open_installer_terminal", async move {
        blocking(sbx::open_installer_terminal).await
    })
    .await
}

#[tauri::command]
async fn enable_image_paste() -> Result<(), String> {
    logged("enable_image_paste", async move {
        blocking(sbx::set_clipboard_image_paste).await
    })
    .await
}

#[tauri::command]
async fn setup_ssh() -> Result<String, String> {
    logged("setup_ssh", async move {
        blocking(|| sbx::run_capture(&["setup", sbx::SSH_SETUP_COMMAND])).await
    })
    .await
}

#[tauri::command]
async fn login() -> Result<String, String> {
    logged("login", async move { blocking(sbx::run_login).await }).await
}

#[tauri::command]
async fn sandboxes() -> Result<Vec<sbx::SandboxInfo>, String> {
    logged(
        "sandboxes",
        async move { blocking(sbx::list_sandboxes).await },
    )
    .await
}

#[tauri::command]
async fn start_sandbox(name: String) -> Result<String, String> {
    logged("start_sandbox", async move {
        blocking(move || sbx::start_sandbox(&name)).await
    })
    .await
}

#[tauri::command]
async fn stop_sandbox(name: String) -> Result<String, String> {
    logged("stop_sandbox", async move {
        blocking(move || sbx::stop_sandbox(&name)).await
    })
    .await
}

#[tauri::command]
async fn restart_sandbox(name: String) -> Result<String, String> {
    logged("restart_sandbox", async move {
        blocking(move || sbx::restart_sandbox(&name)).await
    })
    .await
}

#[tauri::command]
async fn remove_sandbox(name: String) -> Result<String, String> {
    logged("remove_sandbox", async move {
        blocking(move || sbx::remove_sandbox(&name)).await
    })
    .await
}

#[tauri::command]
async fn list_settings() -> Result<Vec<sbx::SettingRecord>, String> {
    logged("list_settings", async move {
        blocking(sbx::list_settings).await
    })
    .await
}

#[tauri::command]
async fn set_setting(key: String, value_json: String) -> Result<String, String> {
    logged("set_setting", async move {
        blocking(move || sbx::set_setting(&key, &value_json)).await
    })
    .await
}

#[tauri::command]
async fn unset_setting(key: String) -> Result<String, String> {
    logged("unset_setting", async move {
        blocking(move || sbx::unset_setting(&key)).await
    })
    .await
}

#[tauri::command]
async fn open_terminal(name: String) -> Result<(), String> {
    logged("open_terminal", async move {
        blocking(move || sbx::open_terminal(&name)).await
    })
    .await
}

#[tauri::command]
async fn connection_info(name: String) -> Result<sbx::ConnectionInfo, String> {
    logged("connection_info", async move {
        blocking(move || sbx::connection_info(&name)).await
    })
    .await
}

#[tauri::command]
async fn get_providers(app: tauri::AppHandle) -> Result<Vec<catalog::Provider>, String> {
    logged("get_providers", async move {
        let root = data_dir(&app)?;
        blocking(move || catalog::get_providers(&root)).await
    })
    .await
}

#[tauri::command]
async fn save_providers(
    app: tauri::AppHandle,
    providers: Vec<catalog::Provider>,
) -> Result<Vec<catalog::Provider>, String> {
    logged("save_providers", async move {
        let root = data_dir(&app)?;
        blocking(move || catalog::save_providers(&root, providers)).await
    })
    .await
}

#[tauri::command]
async fn provider_versions(
    app: tauri::AppHandle,
    provider: catalog::Provider,
    refresh: Option<bool>,
) -> Result<Vec<String>, String> {
    logged("provider_versions", async move {
        let root = data_dir(&app)?;
        blocking(move || catalog::provider_versions(&root, provider, refresh.unwrap_or(false)))
            .await
    })
    .await
}

#[tauri::command]
async fn discover_kits(
    app: tauri::AppHandle,
    providers: Vec<catalog::Provider>,
    refresh: Option<bool>,
) -> Result<catalog::Catalog, String> {
    logged("discover_kits", async move {
        let root = data_dir(&app)?;
        let refresh = refresh.unwrap_or(false);
        blocking(move || catalog::discover_kits(&root, providers, refresh)).await
    })
    .await
}

#[tauri::command]
async fn save_template(
    app: tauri::AppHandle,
    request: environments::SaveTemplateRequest,
) -> Result<environments::SavedTemplate, String> {
    logged("save_template", async move {
        let root = data_dir(&app)?;
        blocking(move || environments::save_template(&root, request)).await
    })
    .await
}

#[tauri::command]
async fn list_templates(app: tauri::AppHandle) -> Result<Vec<environments::SavedTemplate>, String> {
    logged("list_templates", async move {
        let root = data_dir(&app)?;
        blocking(move || environments::list_templates(&root)).await
    })
    .await
}

#[tauri::command]
async fn template_warnings(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    logged("template_warnings", async move {
        let root = data_dir(&app)?;
        blocking(move || environments::template_warnings(&root)).await
    })
    .await
}

#[tauri::command]
async fn read_template_details(
    app: tauri::AppHandle,
    id: String,
) -> Result<environments::TemplateDetails, String> {
    logged("read_template_details", async move {
        let root = data_dir(&app)?;
        blocking(move || environments::read_template_details(&root, &id)).await
    })
    .await
}

#[tauri::command]
async fn update_template(
    app: tauri::AppHandle,
    id: String,
    request: environments::UpdateTemplateRequest,
) -> Result<environments::SavedTemplate, String> {
    logged("update_template", async move {
        let root = data_dir(&app)?;
        blocking(move || environments::update_template(&root, &id, request)).await
    })
    .await
}

#[tauri::command]
async fn delete_template(app: tauri::AppHandle, id: String) -> Result<(), String> {
    logged("delete_template", async move {
        let root = data_dir(&app)?;
        blocking(move || environments::delete_template(&root, &id)).await
    })
    .await
}

#[tauri::command]
async fn launch_template(
    app: tauri::AppHandle,
    on_progress: tauri::ipc::Channel<crate::progress::LaunchProgress>,
    id: String,
    name: Option<String>,
    workspace: Option<String>,
) -> Result<String, String> {
    logged("launch_template", async move {
        let root = data_dir(&app)?;
        blocking(move || {
            environments::launch_template(&root, &id, name, workspace, &mut |progress| {
                // A closed or slow UI must not fail or block the launch.
                let _ = on_progress.send(progress);
            })
        })
        .await
    })
    .await
}

#[tauri::command]
async fn pick_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    logged("pick_workspace", async move {
        blocking(move || environments::pick_workspace(&app)).await
    })
    .await
}

#[tauri::command]
async fn pick_template_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    logged("pick_template_path", async move {
        blocking(move || environments::pick_template_path(&app)).await
    })
    .await
}

/// The diagnostic log file, read from the end (newest last). The cap keeps
/// the payload bounded at 10 MiB.
#[tauri::command]
async fn read_debug_log(app: tauri::AppHandle) -> Result<String, String> {
    let root = data_dir(&app)?;
    blocking(move || {
        let path = logging::log_path(&root);
        std::fs::read_to_string(&path).or_else(|error| match error.kind() {
            // A missing file is an empty log, not a failure: nothing has
            // been logged yet (or the user cleared it).
            std::io::ErrorKind::NotFound => Ok(String::new()),
            _ => Err(format!("Cannot read {}: {error}", path.display())),
        })
    })
    .await
}

/// The directory holding the diagnostic log file, so the Settings log viewer
/// can offer the user a way to reach it in the file manager.
#[tauri::command]
async fn debug_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let root = data_dir(&app)?;
    Ok(root.to_string_lossy().into_owned())
}

/// Delete the diagnostic log. The next write recreates it.
#[tauri::command]
async fn clear_debug_log(app: tauri::AppHandle) -> Result<(), String> {
    let root = data_dir(&app)?;
    blocking(move || {
        let path = logging::log_path(&root);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Cannot clear {}: {error}", path.display())),
        }
    })
    .await
}

pub(crate) fn handlers() -> Box<tauri::ipc::InvokeHandler<tauri::Wry>> {
    Box::new(tauri::generate_handler![
        check_setup,
        reveal_main,
        close_splash,
        open_setup_window,
        open_installer_terminal,
        quit_app,
        enable_image_paste,
        setup_ssh,
        login,
        sandboxes,
        start_sandbox,
        stop_sandbox,
        restart_sandbox,
        remove_sandbox,
        list_settings,
        set_setting,
        unset_setting,
        open_terminal,
        connection_info,
        get_providers,
        save_providers,
        provider_versions,
        discover_kits,
        save_template,
        list_templates,
        template_warnings,
        read_template_details,
        update_template,
        delete_template,
        launch_template,
        pick_workspace,
        pick_template_path,
        read_debug_log,
        clear_debug_log,
        debug_log_dir
    ])
}
