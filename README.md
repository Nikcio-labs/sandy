# Sandy

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Sandy icon" width="120">
</p>

A desktop app for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) with guided setup, reusable environment templates, and local sandbox management, powered by the `sbx` CLI.

## What it does

- **Sandboxes** — see your local sandboxes with their state, agent, and workspace. Search, start, stop, and restart them, and refresh manually or let the list refresh itself every 5 seconds.
- **Open** — connect a running sandbox to your terminal (`sbx exec`) or editor (VS Code and OpenCode Desktop over SSH), with copyable connection details and setup checks. Hosts are `<name>.sbx` — see Docker's [editor and app integrations](https://docs.docker.com/ai/sandboxes/integrations/).
- **Create** — enable kit providers (GitHub, Docker Hub search, or specific Docker Hub repositories), discover kits, and pick a **v2 agent** or **v3 workload**. Complete the kit inputs, choose a workspace folder (or run mountless, with no host folder at all), and name the sandbox.
- **Templates** — save any environment as a real `sbxenv.yaml` file and relaunch it later with a different name or workspace. Edit a saved template to change its kits, inputs, or project in place, or delete it when you're done. Each launch creates its own file outside the workspace; saved templates stay intact until you edit or delete them.
- **Setup** — Settings walks you through installing the `sbx` CLI, signing in to Docker, enabling image pasting, and setting up SSH. Each step shows what it runs, can be skipped, and can be revisited later.

## Installing Sandy

Download the installer for your platform from the [releases page](https://github.com/nikcio/sandy/releases) — Sandy is built and attached automatically whenever a release is published:

| Platform | File |
| -------- | ---- |
| macOS (Apple silicon) | `.dmg` |
| Windows | `.msi` (or the NSIS `.exe` setup) |
| Linux | `.AppImage` or `.deb` |

## Building from source

Requirements: Node.js 22+, [pnpm](https://pnpm.io) (`corepack enable`), Rust (stable), and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your platform. On Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev file pkg-config libdbus-1-dev
```

```bash
pnpm install
pnpm tauri dev    # run in development
pnpm tauri build  # produce installers
```

Packages are pinned exactly and installs reject anything published in the last 24 hours (`pnpm-workspace.yaml`) as supply-chain protection.

### Windows: `link.exe` errors

If `pnpm tauri dev` on Windows fails with `link: extra operand '…'`, the wrong `link.exe` was found on your PATH — Git Bash ships a Unix `link` tool with the same name as the MSVC linker. Build from a developer shell instead so the MSVC toolchain comes first:

- **PowerShell**: `Import-Module "C:\Program Files\Microsoft Visual Studio\18\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"; Enter-VsDevShell -VsInstallPath "C:\Program Files\Microsoft Visual Studio\18\BuildTools" -SkipAutomaticLocation` (adjust `18\BuildTools` to your edition — find the folder under `C:\Program Files\Microsoft Visual Studio\`), or
- launch the **x64 Native Tools Command Prompt for VS** from the Start menu and run the commands there.

The VS Build Tools installer must include the **Desktop development with C++** workload (`winget install Microsoft.VisualStudio.BuildTools`, currently major version 18 / "Visual Studio 2026").

## Notes

- Sandbox names, states, agents, and workspaces come from the local `sbx` CLI. Sandy checks PATH and standard Homebrew/Windows installer locations for it; custom installations should put the native CLI on PATH.
- Local sandbox launches require your platform's virtualization support; see Docker's [installation prerequisites](https://docs.docker.com/ai/sandboxes/install/).
- For a CLI-first workflow, use the [`sbxenv.yaml` examples](https://github.com/nikcio/docker-sandboxing#use-it-in-your-project) and run `sbx env run` in your project.

## License

[MIT](LICENSE)
