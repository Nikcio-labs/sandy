# Sandy

A desktop app for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) with guided setup, reusable environment templates, and local sandbox management, powered by the `sbx` CLI. The frontend is React + TypeScript (Vite), the desktop shell is Tauri 2 (Rust), and the package manager is pnpm.

## Before you start

Always pull the latest version of `main` before starting any work, and base your changes on it:

```bash
git fetch origin main
```

Work in a git worktree placed under `.worktrees/`, and keep the base directory checked out on an up-to-date `main`.

## Documentation

Use based on your task:

- [Commit Messages](agent-guidance/commit-messages.md) defines the Conventional Commits style and types. Read when writing commit messages.

## Code comments

Every comment must be relevant to a developer landing on the code 6 months later: it should explain why the code is the way it is (constraints, non-obvious behavior, gotchas) — not narrate what the code obviously does, not reference the current task, ticket, or conversation, and not state something the reader can see or easily infer from the code itself.

If a comment fails that test, omit it; when touching code with such comments, remove them. Temporary or conversational comments (e.g. "TODO: revisit after the migration", "this is a workaround for the bug I introduced above") do not belong in the repo.

## Development

- Packages are pinned exactly, and installs reject anything published in the last 24 hours (`pnpm-workspace.yaml`, `minimumReleaseAge`) as supply-chain protection. Do not relax these settings or introduce loose version ranges.
- Releases use release-please (`.release-please-config.json`): Conventional Commit messages determine the next version and changelog, and published releases are built and attached automatically by the release workflows.
- The app talks to the local `sbx` CLI and Docker Sandboxes; sandbox names, states, agents, and workspaces always come from the CLI — never assume state the CLI has not reported.
- Keep documentation simple and up to date. The `README.md` is the main entry point for users of this project, and its audience is non-technical users with no knowledge of Docker Sandboxes or the `sbx` CLI.
