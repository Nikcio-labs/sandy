use tauri_build::{AppManifest, Attributes};

const COMMANDS: &[&str] = &[
    "check_setup",
    "install_sbx",
    "enable_image_paste",
    "setup_ssh",
    "login",
    "sandboxes",
    "start_sandbox",
    "stop_sandbox",
    "restart_sandbox",
    "remove_sandbox",
    "open_terminal",
    "connection_info",
    "get_providers",
    "save_providers",
    "provider_versions",
    "discover_kits",
    "save_template",
    "list_templates",
    "template_warnings",
    "delete_template",
    "launch_template",
    "allow_source",
    "pick_workspace",
    "pick_template_path",
    "read_debug_log",
    "clear_debug_log",
    "debug_log_dir",
];

fn main() {
    // Without an app ACL manifest tauri skips command authorization for local
    // windows entirely, so every window could invoke every command. Declaring
    // the commands here makes the capability files the only gate for IPC.
    tauri_build::try_build(Attributes::new().app_manifest(AppManifest::new().commands(COMMANDS)))
        .expect("failed to run tauri-build");
}
