# Sandy

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Sandy icon" width="120">
</p>

A desktop app for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) with guided setup, reusable environment templates, and local sandbox management, powered by the `sbx` CLI.

## What it does

- **Sandboxes** — see your local sandboxes with their state, agent, and workspace. Search, start, stop, and restart them, and refresh manually or let the list refresh itself every 5 seconds.
- **Open** — connect a running sandbox to your terminal (`sbx exec`) or editor (VS Code and OpenCode Desktop over SSH), with copyable connection details and setup checks. Hosts are `<name>.sbx` — see Docker's [editor and app integrations](https://docs.docker.com/ai/sandboxes/integrations/).
- **Create** — enable kit providers (GitHub repositories), discover kits, and pick a **v2 agent** or **v3 workload**. Complete the kit inputs, choose a workspace folder (or run mountless, with no host folder at all), and name the sandbox.
- **Templates** — save any environment as a real `sbxenv.yaml` file and relaunch it later with a different name or workspace. Edit a saved template to change its kits, inputs, or project in place, or delete it when you're done. Each launch creates its own file outside the workspace; saved templates stay intact until you edit or delete them. You can also add an environment file you already have on your computer: it stays where it is, is never changed by Sandy, and appears alongside your saved templates for launching.
- **Setup** — Settings walks you through installing the `sbx` CLI, signing in to Docker, enabling image pasting, and setting up SSH. Each step shows what it runs, can be skipped, and can be revisited later.

## Installing Sandy

Download the installer for your platform from the [releases page](https://github.com/Nikcio-labs/sandy/releases):

| Platform | File |
| -------- | ---- |
| macOS (Apple silicon) | `.dmg` |
| Windows | `.msi` or `.exe` |
| Linux | `.AppImage` or `.deb` |

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
