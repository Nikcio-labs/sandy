# Sandy

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Sandy icon" width="120">
</p>

A desktop app for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) with guided setup, reusable environment templates, and local sandbox management.

Docker Sandboxes are disposable development environments that AI coding agents work inside. Sandy drives Docker's `sbx` command-line tool, which manages those sandboxes on your computer — you never need to learn the CLI; Sandy installs it and runs its commands for you.

## What it does

- **Sandboxes** - see your local sandboxes and manage them.
- **Open** - connect to a running sandbox.
- **Create** - create your own sandboxes with an intuitive picker interface.
- **Templates** - save predefined environments and relaunch them later with a different name or workspace.
- **Setup** - Guided setup process helping you get started.

## Installing Sandy

Download the installer for your platform from the [releases page](https://github.com/Nikcio-labs/sandy/releases):

| Platform | File |
| -------- | ---- |
| macOS (Apple silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` or `.exe` |
| Windows (ARM) | `.msi` or `.exe` |
| Linux | `.AppImage` or `.deb` |
| Linux (ARM) | `.AppImage` or `.deb` |

[Releases page](https://github.com/Nikcio-labs/sandy/releases)

## Building from source

Requirements: Node.js 24+, [pnpm](https://pnpm.io) (`corepack enable`), Rust (stable), and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your platform. On Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev file pkg-config libdbus-1-dev
```

```bash
pnpm install
pnpm tauri dev    # run in development
pnpm tauri build  # produce installers
```

### Windows: `link.exe` errors

If `pnpm tauri dev` on Windows fails with `link: extra operand '…'`, the wrong `link.exe` was found on your PATH — Git Bash ships a Unix `link` tool with the same name as the MSVC linker. Build from a developer shell instead so the MSVC toolchain comes first:

- **PowerShell**: `Import-Module "C:\Program Files\Microsoft Visual Studio\18\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"; Enter-VsDevShell -VsInstallPath "C:\Program Files\Microsoft Visual Studio\18\BuildTools" -SkipAutomaticLocation` (adjust `18\BuildTools` to your edition — find the folder under `C:\Program Files\Microsoft Visual Studio\`), or
- launch the **x64 Native Tools Command Prompt for VS** from the Start menu and run the commands there.

The VS Build Tools installer must include the **Desktop development with C++** workload (`winget install Microsoft.VisualStudio.BuildTools`, currently major version 18 / "Visual Studio 2026").

## Notes

- Sandbox names, states, agents, and workspaces come from the local `sbx` CLI. Sandy checks PATH and standard Homebrew/Windows installer locations for it; custom installations should put the native CLI on PATH.
- Local sandbox launches require your platform's virtualization support; see Docker's [installation prerequisites](https://docs.docker.com/ai/sandboxes/install/).
- Kit discovery talks to GitHub anonymously, which allows 60 requests per hour. In Settings you can connect your GitHub account with a personal access token to raise the limit to 5,000 per hour. The token stays on your computer, is never shown again after saving, and is only ever sent to GitHub.
- For a CLI-first workflow, use the [`sbxenv.yaml` examples](https://github.com/nikcio/docker-sandboxing#use-it-in-your-project) and run `sbx env run` in your project.

## License

[MIT](LICENSE)
