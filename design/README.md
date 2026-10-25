# Sandy design demo

Open [`design-concepts.html`](design-concepts.html) directly in a browser. No build or server is needed. Gabarito is the only external resource; the demo still works without the font or an internet connection.

The prototype uses in-memory fixtures. It never runs commands, touches files, signs in, opens a terminal, or downloads updates. Reloading or **Reset demo** restores its starting data. Changing the scene also resets the app fixtures.

## Things to try

- Start, stop, and restart sandboxes. Enable **Fail next operation** to try recovery. A failed restart leaves the sandbox stopped after the successful stop phase.
- Connect through Terminal, OpenCode Desktop, or VS Code. SSH setup is optional and only appears in the editor guides.
- Create an environment through all four steps. Try a v2 built-in agent with Node.js, or a v3 workload with Playwright. Enable **Example team (demo)** to try a fictional mixin with required inputs.
- Save and launch with failure enabled: saving succeeds, launch fails, and retry reuses the saved template. Save-only can fail separately without losing form inputs.
- Launch a template with an existing sandbox name. It resumes the existing configuration rather than applying the template again. Use a new name for a new sandbox.
- Edit or delete a template. Editing updates the same saved file. Deleting removes the file and catalog record, but not sandboxes created from it.
- Explore settings panes, provider edits, typed settings, updates, and diagnostic logs. Try invalid JSON, reset-to-default, and leaving unsaved changes.
- Replay first open, or choose loading, empty, CLI-unavailable, and sign-in-needed scenes.

## Grounding and intentional proposals

Checked against the application and [Docker Sandboxes documentation](https://docs.docker.com/ai/sandboxes/).

| Area | Source of truth and demo behavior |
| --- | --- |
| Local scope | Sandy manages local microVM sandboxes through `sbx`. Cloud compute, policy management, and secret management are not added to the demo. Docker Desktop/Engine is not a prerequisite for `sbx`; local virtualization is. |
| State | `src/common/lib/sandboxState.ts`. Running/stopped classification is exact; other CLI labels retain their text with inactive styling. Pending actions are a separate map, never an invented CLI state. |
| Lifecycle | `src-tauri/src/sbx/lifecycle.rs`. Start is `sbx run --detach --name NAME`; restart is stop followed by start. A failed start does not fabricate a running state. |
| Connection | `src/features/connect/` and `src-tauri/src/sbx/terminal.rs`. Terminal uses `sbx exec -it NAME /bin/bash`; SSH uses `NAME.sbx`, `_default_user_`, and no fixed TCP port. |
| Creation | `src/features/create/` and `src/lib/kit.ts`. Providers → agent/workload → compatible mixins and inputs → project/review. Environment schema v1 is separate from kit format v2/v3. |
| Kit sources | Sandy currently launches selected kits from enabled GitHub providers. Real fixture references use pinned Git commits from `nikcio/docker-sandboxing` and the `v3` branch of `docker/sbx-kits-contrib`. The fictional `example/team-kits` fixture is explicitly labeled and disabled initially. No remote discovery or compatibility execution is claimed. |
| Persistence and launch | `src-tauri/src/environments/launch.rs`. Environment files stay outside the workspace; launch uses an immutable snapshot, `sbx env create --force`, then detached run. Existing names resume without replaying creation or replacing their configuration. A mountless saved template cannot gain a workspace at launch; edit it first. |
| Paths | The browser only checks path syntax and lexical containment. The real backend additionally checks existence, canonicalizes paths, handles symlinks, and verifies directories. Sample paths and file locations are illustrative, not OS discoveries. |
| Setup | **Intentional proposal:** only installation and Docker sign-in are required. The current `setupSteps.ts` still includes image paste and SSH in its completeness check. The demo presents these as optional host access, never setup warnings. |
| Settings | **Intentional proposal:** nested panes and a generic settings editor. The current app does not yet expose this full editor. Its 31 keys are a snapshot of [documented settings](https://docs.docker.com/ai/sandboxes/configuration/settings/), not a claim about the installed CLI. A real implementation must render every CLI-returned key, type, effective value, exact default, source, and restart requirement. The trusted-signer fixture is illustrative, not an authoritative policy. |
| Workspace safety | A direct mount exposes actual host files; there is no sync or protective copy. Mountless files and installed tools persist across stops/restarts and disappear on sandbox removal. Other explicitly configured host access still applies. |

The demo does not claim real authorization, source-policy enforcement, signature verification, package installation, or model-provider authentication. Those remain backend/CLI responsibilities. Self-host Gabarito when bringing the design into the offline-first desktop app.

## Verification

`verify-demo.mjs` checks the standalone HTML and browser flows, including failure/retry, template persistence, resume semantics, YAML escaping, keyboard focus, reduced motion, and layouts from 360px to desktop. It blocks font requests to verify that the demo works offline and rejects other runtime network requests.

Use an existing `playwright-core` installation and Chromium binary; no project dependency changes are needed:

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
node design/verify-demo.mjs
```

If Playwright and its browser are already available to Node, the environment variables can be omitted.
