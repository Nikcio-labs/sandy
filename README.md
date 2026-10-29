# Sandy

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Sandy icon" width="120">
</p>

A desktop app for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) with guided setup, reusable environment templates, and local sandbox management, powered by the `sbx` CLI.

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

The VS Build Tools installer must include the **Desktop development with C++** workload (`winget install Microsoft.VisualStudio.BuildTools`).
