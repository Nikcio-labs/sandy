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
                        // JSON Lines, one object per record, parsed by the
                        // Settings log viewer; the plugin's default format
                        // is human-readable prose.
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
            let mut targets = vec![Target::new(TargetKind::Stdout)];
            targets.extend(file_targets);
            let log_builder = tauri_plugin_log::Builder::new()
                .targets(targets)
                // Dependency crates (reqwest, hyper, ...) log at Info and
                // would bury the app's own records without this.
                .level(log::LevelFilter::Info)
                .max_file_size(10 * 1024 * 1024);
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
        // `run()` returns () and there is nowhere left to report a fatal
        // startup error; exiting with the message is the only option here.
        .run(tauri::generate_context!())
        .expect("error while running Sandy");
}
