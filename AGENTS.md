# Sandy

A desktop app for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) with guided setup, reusable environment templates, and local sandbox management, powered by the `sbx` CLI. The frontend is React + TypeScript (Vite), the desktop shell is Tauri 2 (Rust), and the package manager is pnpm.

## Before you start

Always pull the latest version of `main` before starting any work, and base your changes on it:

```bash
git fetch origin main
```

## Documentation

Use based on your task:

- `README.md` covers what Sandy does, the installers, and building from source. Read for an overview of the app and its features.
- [Commit Messages](agent-guidance/commit-messages.md) defines the Conventional Commits style, types, scopes, and examples. Read when writing commit messages.
- `.github/workflows/ci.yml` defines what CI runs: a frontend typecheck + build, and `rustfmt` + `clippy` + `cargo check` for the Rust code. Every change to `src/**` or `src-tauri/**` must pass both.

## Code comments

Every comment must be relevant to a developer landing on the code 6 months later: it should explain why the code is the way it is (constraints, non-obvious behavior, gotchas) — not narrate what the code obviously does, not reference the current task, ticket, or conversation, and not state something the reader can see or easily infer from the code itself.

If a comment fails that test, omit it; when touching code with such comments, remove them. Temporary or conversational comments (e.g. "TODO: revisit after the migration", "this is a workaround for the bug I introduced above") do not belong in the repo.

## Artifacts

- `src/**` — Frontend (React + TypeScript). Features live in `src/features/<feature>` with their components and hooks; shared code lives in `src/common` and `src/lib`. The `sbx` CLI is invoked from the Rust side, not from the frontend.
- `src-tauri/**` — Tauri backend (Rust). Commands exposed to the frontend live in `commands.rs`; the `sbx` CLI integration lives in `sbx`, template/environment handling in `environments`.
- `src-tauri/tauri.conf.json` + `src-tauri/capabilities` — Tauri app configuration and permission capabilities. Frontend access to a Tauri command or plugin requires the matching capability entry.
- `.github/workflows` — CI (typecheck/build + Rust checks) and release automation.

## Development

- Install dependencies with `pnpm install`, run the app with `pnpm tauri dev`, and build installers with `pnpm tauri build`. `pnpm build` typechecks and builds the frontend only; Rust changes are checked with `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and `cargo check` in `src-tauri`.
- Packages are pinned exactly, and installs reject anything published in the last 24 hours (`pnpm-workspace.yaml`, `minimumReleaseAge`) as supply-chain protection. Do not relax these settings or introduce loose version ranges.
- Releases use release-please (`.release-please-config.json`): Conventional Commit messages determine the next version and changelog, and published releases are built and attached automatically by the release workflows.
- The app talks to the local `sbx` CLI and Docker Sandboxes; sandbox names, states, agents, and workspaces always come from the CLI — never assume state the CLI has not reported.
- Keep documentation simple and up to date. The `README.md` is the main entry point for users of this project.
