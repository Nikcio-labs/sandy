mod catalog;
mod commands;
mod environments;
mod logging;
mod progress;
mod sbx;
mod setup;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind, log};
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};
use time::OffsetDateTime;
use time::format_description::FormatItem;
use time::macros::format_description;

// Mirrors the plugin's default desktop timestamp format so the stdout
// target keeps its shape after `clear_format()` below.
const STDOUT_TIME_FORMAT: &[FormatItem<'static>] =
    format_description!("[[[year]-[month]-[day]][[[hour]:[minute]:[second]]");

// App entry point: there is no caller to return an error to, so a fatal
// startup failure may panic.
#[allow(clippy::expect_used, clippy::panic)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(commands::handlers())
        // The main window is created hidden and revealed from React after the
        // splash is dismissed (or by the setup window after first-run setup);
        // the plugin's VISIBLE flag would show() it as
        // soon as its state restores, so visibility stays under the
        // frontend's control while size and position still restore. The
        // splash is denylisted: its geometry is hardcoded and it must stay
        // centered and out of the persisted state file. The setup window
        // joins it: a modal first-run screen, not a workspace the user
        // arranges.
        .plugin(
            WindowStateBuilder::new()
                .with_denylist(&["splash", "setup"])
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .setup(|app| {
            // The plugin is registered here instead of via the builder's
            // `.plugin()` chain because attaching the global logger needs the
            // app handle, and a logging failure must degrade to stdout-only
            // rather than abort startup the way `plugin()` propagation would.
            // The diagnostic file target must match `read_debug_log` and
            // `clear_debug_log`, which resolve the app data dir themselves:
            // the plugin's own LogDir lives elsewhere (and differs per OS),
            // so the file is pinned here next to providers.json and the
            // template library.
            let file_targets = app.path().app_data_dir().map_or_else(
                |_| Vec::new(),
                |root| {
                    vec![
                        Target::new(TargetKind::Folder {
                            path: root,
                            file_name: Some(logging::LOG_STEM.into()),
                        })
                        .format(|out, message, record| {
                            out.finish(format_args!(
                                "{}",
                                logging::file_line(
                                    record.level(),
                                    record.target(),
                                    &message.to_string()
                                )
                            ))
                        }),
                    ]
                },
            );
            let stdout_target = Target::new(TargetKind::Stdout).format(|out, message, record| {
                out.finish(format_args!(
                    "{}[{}][{}] {}",
                    OffsetDateTime::now_utc()
                        .format(&STDOUT_TIME_FORMAT)
                        .unwrap_or_default(),
                    record.target(),
                    record.level(),
                    message
                ))
            });
            let mut targets = vec![stdout_target];
            targets.extend(file_targets);
            let log_builder = tauri_plugin_log::Builder::new()
                .targets(targets)
                // Dependency crates (reqwest, hyper, ...) log at Info and
                // would bury the app's own records without this.
                .level(log::LevelFilter::Info)
                .max_file_size(10 * 1024 * 1024)
                // The plugin formats each record once at the builder level,
                // prefix included, so every target's formatter would receive
                // the prose header instead of the raw message.
                .clear_format();
            if let Ok((plugin, max_level, logger)) = log_builder.split(app.handle()) {
                app.handle().plugin(plugin).ok();
                let _ = tauri_plugin_log::attach_logger(max_level, logger);
            }
            // Only after the logger is attached can a warning reach stdout;
            // release builds on Windows have no console, so it may still be
            // invisible there.
            if app.path().app_data_dir().is_err() {
                log::warn!("app data dir unavailable; diagnostic log disabled");
            }
            log::info!(target: "app", "Sandy started");
            Ok(())
        })
        .on_window_event(|window, event| {
            // The setup window is the only thing on screen during first-run
            // setup; if the user closes it anyway (Alt+F4, taskbar), the
            // app must not stay hidden behind it.
            if window.label() != "setup" || !matches!(event, tauri::WindowEvent::Destroyed) {
                return;
            }
            let app = window.app_handle();
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            }
            if let Some(splash) = app.get_webview_window("splash") {
                let _ = splash.close();
            }
        })
        // `run()` returns () and there is nowhere left to report a fatal
        // startup error; exiting with the message is the only option here.
        .run(tauri::generate_context!())
        .expect("error while running Sandy");
}
