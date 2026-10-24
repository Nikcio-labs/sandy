mod catalog;
mod commands;
mod diaglog;
mod environments;
mod progress;
mod sbx;
mod setup;

// Tests may unwrap/expect freely — a panic is exactly the failure mode we want.
#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests;

use tauri::Manager;
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};

/// Origins the trusted main window may navigate to. Tauri serves the bundled
/// frontend from a custom protocol whose spelling differs by platform
/// (`tauri://localhost` on macOS/Linux, `http(s)://tauri.localhost` on
/// Windows), and debug builds load from the Vite dev server instead. Without
/// this guard a redirect or a clicked link could swap the whole app UI for
/// arbitrary remote content inside the chrome-less trusted window.
fn is_allowed_origin(url: &tauri::Url) -> bool {
    // (scheme, host, port): `port_or_known_default` fills in the scheme's
    // default port, so explicit and implicit defaults (`http://host` vs
    // `http://host:80`) compare equal; `tauri` has no default port.
    const APP_ORIGINS: &[(&str, &str, Option<u16>)] = &[
        ("tauri", "localhost", None),
        ("http", "tauri.localhost", Some(80)),
        ("https", "tauri.localhost", Some(443)),
    ];

    let matches =
        |scheme: &str, host: &str, port: Option<u16>| -> bool {
            url.scheme() == scheme
                && url.host_str() == Some(host)
                && url.port_or_known_default() == port
        };

    APP_ORIGINS
        .iter()
        .any(|&(scheme, host, port)| matches(scheme, host, port))
        // The dev server origin mirrors `build.devUrl` in tauri.conf.json;
        // the two must be kept in sync because the config is not readable
        // from a plain comparison helper.
        || (cfg!(debug_assertions) && matches("http", "localhost", Some(1420)))
}

// App entry point: there is no caller to return an error to, so a fatal
// startup failure may panic.
#[allow(clippy::expect_used, clippy::panic)]
pub fn run() {
    tauri::Builder::default()
        // In tauri 2.x the navigation hook lives on the plugin builder, so
        // the guard is registered as a plugin. First registered, first
        // consulted, so it vetoes before any other hook runs.
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_webview, url| is_allowed_origin(url))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(commands::handlers())
        // The main window is created hidden and revealed from React after the
        // splash is dismissed; the plugin's VISIBLE flag would show() it as
        // soon as its state restores, so visibility stays under the
        // frontend's control while size and position still restore. The
        // splash is denylisted: its geometry is hardcoded and it must stay
        // centered and out of the persisted state file.
        .plugin(
            WindowStateBuilder::new()
                .with_denylist(&["splash"])
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .setup(|app| {
            // The diagnostic log lives next to providers.json and the template
            // library. Its path is fixed once, before any command can run.
            if let Ok(root) = app.path().app_data_dir() {
                diaglog::init(diaglog::log_path(&root));
                diaglog::info("Sandy started");
            }
            Ok(())
        })
        // `run()` returns () and there is nowhere left to report a fatal
        // startup error; exiting with the message is the only option here.
        .run(tauri::generate_context!())
        .expect("error while running Sandy");
}
