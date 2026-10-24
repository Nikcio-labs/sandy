mod catalog;
mod commands;
mod diaglog;
mod environments;
mod progress;
mod sbx;
mod setup;

use tauri::Manager;

// App entry point: there is no caller to return an error to, so a fatal
// startup failure may panic.
#[allow(clippy::expect_used, clippy::panic)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(commands::handlers())
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
