mod catalog;
mod commands;
mod diaglog;
mod environments;
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
            // `.plugin()` chain because the split API needs the app handle to
            // attach the global logger, and a logging failure must degrade to
            // stdout-only rather than abort startup the way `plugin()`
            // propagation would.
            let dispatch = fern::Dispatch::new().chain(fern::Output::call(|record| {
                let kind = match record.level() {
                    log::Level::Error => "error",
                    log::Level::Warn | log::Level::Info => "info",
                    log::Level::Debug | log::Level::Trace => "info",
                };
                match record.level() {
                    log::Level::Error => {
                        diaglog::write_record(kind, &record.args().to_string(), None, Some("error"))
                    }
                    _ => diaglog::write_record(kind, &record.args().to_string(), None, None),
                }
            }));
            let log_builder = tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Dispatch(dispatch)),
                ])
                .level(log::LevelFilter::Info);
            // Losing the plugin's logs must never break the app; at worst the
            // global logger is not installed and stdout still shows records
            // until the global logger attaches.
            if let Ok((plugin, max_level, logger)) = log_builder.split(app.handle()) {
                app.handle().plugin(plugin).ok();
                let _ = tauri_plugin_log::attach_logger(max_level, logger);
            }
            // The diagnostic log lives next to providers.json and the template
            // library. Its path is fixed once, before any command can run.
            if let Ok(root) = app.path().app_data_dir() {
                diaglog::init(diaglog::log_path(&root));
                diaglog::info("Sandy started");
            } else {
                // Release builds on Windows have no console, so this warning
                // is only visible on other platforms or in dev runs.
                log::warn!("app data dir unavailable; diagnostic log disabled");
            }
            Ok(())
        })
        // `run()` returns () and there is nowhere left to report a fatal
        // startup error; exiting with the message is the only option here.
        .run(tauri::generate_context!())
        .expect("error while running Sandy");
}
