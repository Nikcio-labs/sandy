//! Installing the `sbx` CLI per platform (Homebrew, WinGet, apt).
//!
//! The install runs in a visible terminal, not captured by Sandy: sudo and
//! WinGet confirmation prompts need a real console the user can answer, and
//! the output must stay readable. Sandy only verifies the result afterwards.

use std::process::Command;

#[cfg(target_os = "windows")]
use super::cli::HideConsole;

use super::cli::is_sbx_installed;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use super::terminal::spawn_terminal;

/// Open a terminal that runs the platform's installer. An already installed
/// CLI needs no install; the wizard skips straight past.
pub fn open_installer_terminal() -> Result<(), String> {
    if is_sbx_installed() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        open_macos_installer()
    }
    #[cfg(target_os = "windows")]
    {
        open_windows_installer()
    }
    #[cfg(target_os = "linux")]
    {
        open_linux_installer()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("This platform is not supported yet.".to_string())
    }
}

/// macOS: Homebrew is the documented install path. The install command is
/// one line per statement: AppleScript string literals cannot span lines.
#[cfg(target_os = "macos")]
fn open_macos_installer() -> Result<(), String> {
    use super::terminal::{applescript_quote, shell_quote};
    let script = "if ! command -v brew >/dev/null 2>&1; then echo \"Homebrew is required to install sbx. Install it from https://brew.sh and try this step again.\"; else brew install docker/tap/sbx; echo; if command -v sbx >/dev/null 2>&1; then echo \"Install finished. You can close this window.\"; else echo \"Installation failed. Scroll up for details.\"; fi; fi; echo \"Press Enter to close this window.\"; read _";
    let applescript = format!(
        "tell application \"Terminal\"\nactivate\ndo script {}\nend tell",
        applescript_quote(&format!("exec {}", shell_quote(script)))
    );
    let mut command = Command::new("/usr/bin/osascript");
    command.args(["-e", &applescript]);
    // osascript exits after the Apple event; report automation permission
    // failures synchronously rather than silently swallowing them.
    let output = command
        .output()
        .map_err(|e| format!("could not open Terminal: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "could not open Terminal: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

/// Windows: WinGet installs the per-user MSI; the terminal stays open
/// (`-NoExit`) so confirmation prompts and output remain readable. sbx is
/// called by full path: the installer's PATH change only reaches processes
/// started afterwards.
#[cfg(target_os = "windows")]
fn open_windows_installer() -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    let script = "winget install -h Docker.sbx\necho ''\nif (Test-Path \"$env:LOCALAPPDATA\\DockerSandboxes\\bin\\sbx.exe\") { echo 'Install finished. You can close this window and return to Sandy.' } else { echo 'Installation failed. Scroll up for details.' }";
    if let Ok(program) = which::which("wt.exe") {
        let mut command = Command::new(program);
        command.args([
            "new-tab",
            "--",
            "powershell",
            "-NoProfile",
            "-NoExit",
            "-Command",
            script,
        ]);
        // `wt.exe` is a console-subsystem launcher stub: without this flag
        // the release build briefly flashes a console for the stub itself.
        // The real terminal window is opened by the stub and stays visible.
        command.hide_console();
        if spawn_terminal(command).is_ok() {
            return Ok(());
        }
    }
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NoExit", "-Command", script])
        .creation_flags(0x00000010); // CREATE_NEW_CONSOLE
    spawn_terminal(command)
}

/// Linux (Ubuntu/Debian): add Docker's apt repository and install the
/// docker-sbx package, then add the current user to the kvm group for
/// local sandboxes. Mirrors https://docs.docker.com/ai/sandboxes/install/.
#[cfg(target_os = "linux")]
fn open_linux_installer() -> Result<(), String> {
    if !std::path::Path::new("/usr/bin/apt-get").exists() {
        return Err(
            "Only Ubuntu/Debian systems are supported by the automatic installer.\n\
             See https://docs.docker.com/ai/sandboxes/install/ for manual instructions."
                .to_string(),
        );
    }
    // The install script runs as root via `sudo sh`, so it must be
    // downloaded to a private (mode 600) file the invoking user owns; a
    // predictable /tmp path would let another local user swap its content.
    // The trap removes it even when the script aborts early.
    let script = r#"tmpfile="$(mktemp)" || exit 1
trap 'rm -f "$tmpfile"' EXIT
if curl -fsSL https://get.docker.com -o "$tmpfile" && sudo REPO_ONLY=1 sh "$tmpfile" && sudo apt-get install -y docker-sbx; then
  sudo usermod -aG kvm "$(logname 2>/dev/null || id -un)" || echo "warning: could not add user to the kvm group" >&2
  echo
  echo "Install finished. You can close this window and return to Sandy."
else
  echo "Installation failed. Scroll up for details."
fi
echo "Press Enter to close this window."
read _
"#;
    let mut failures = Vec::new();
    // Each of these accepts a program and argv, rather than a shell command
    // string. Avoid terminal flags such as `--command` that concatenate or
    // reparse arguments.
    for (terminal, separator) in [
        ("x-terminal-emulator", "-e"),
        ("gnome-terminal", "--"),
        ("konsole", "-e"),
        ("xfce4-terminal", "-x"),
        ("xterm", "-e"),
    ] {
        if let Ok(program) = which::which(terminal) {
            let mut command = Command::new(program);
            command.arg(separator).arg("bash").arg("-c").arg(script);
            match spawn_terminal(command) {
                Ok(()) => return Ok(()),
                Err(e) => failures.push(format!("{terminal}: {e}")),
            }
        }
    }
    Err(format!(
        "Could not open a terminal. Install a supported terminal (x-terminal-emulator, GNOME Terminal, Konsole, XFCE Terminal, or xterm).\n{}",
        failures.join("\n")
    ))
}
