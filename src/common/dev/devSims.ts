/**
 * Dev-only fault and state injection for the Tauri IPC layer.
 *
 * This module is imported only behind `if (import.meta.env.DEV)` from the
 * dev pane, so Vite dead-code-eliminates it (and everything it pulls in)
 * from production builds.
 *
 * It shadows `window.__TAURI_INTERNALS__.invoke` on the object's prototype
 * — the real property is defined non-writable, so direct assignment (the
 * way `@tauri-apps/api/mocks` swaps the whole internals object) would
 * throw. Shadowing only `invoke` keeps `runCallback`/`transformCallback`
 * intact, which `Channel` streaming needs.
 */

export type Sim = "fresh-setup" | "sbx-failing" | "update-available";

const active = new Set<Sim>();

export const isSimActive = (sim: Sim) => active.has(sim);

type Invoke = NonNullable<Window["__TAURI_INTERNALS__"]["invoke"]>;

/** The shadowing function; null when real invokes pass through. */
let shadow: ((this: TauriInternals, ...a: Parameters<Invoke>) => unknown) | null = null;

/** Fresh-setup: nothing is installed or configured yet. */
const FRESH_SETUP_STATUS = {
  sbx_installed: false,
  signed_in: false,
  image_paste_on: false,
  ssh_set_up: false,
  auth_explanation: null,
  ssh_explanation: null,
  warnings: [],
  issues: [],
};

const SBX_FAILURE =
  "sbx simulated-action failed (exit 1):\nsbx: cannot connect to the sandbox daemon — simulated failure";

const SBX_COMMANDS = [
  "check_setup",
  "sandboxes",
  "list_settings",
  "start_sandbox",
  "stop_sandbox",
  "restart_sandbox",
  "open_terminal",
  "connection_info",
  "install_sbx",
  "setup_ssh",
  "enable_image_paste",
];

/** Deliver one message through a serialized `__CHANNEL__:id` argument. */
function channelSend(serialized: unknown, message: unknown) {
  const match = typeof serialized === "string" && /^__CHANNEL__:(\d+)$/.exec(serialized);
  if (!match) return false;
  window.__TAURI_INTERNALS__.runCallback?.(Number(match[1]), {
    index: 0,
    message,
  });
  return true;
}

const SIMULATED_UPDATE = {
  rid: -1,
  currentVersion: "0.0.0",
  version: "99.0.0-simulated",
  body: "Simulated release so the update flow can be exercised in dev.",
  rawJson: {},
};

function intercept(
  cmd: string,
  args: Record<string, unknown>,
): { kind: "resolve"; value: unknown } | { kind: "reject"; error: Error } | { kind: "pass" } {
  if (active.has("fresh-setup")) {
    if (cmd === "check_setup") return { kind: "resolve", value: FRESH_SETUP_STATUS };
    if (cmd === "sandboxes") return { kind: "resolve", value: [] };
    // The wizard's steps run real installer commands; keep the simulation
    // consistent by reporting the status they would produce.
    if (cmd === "install_sbx" || cmd === "login") {
      return { kind: "resolve", value: "Simulated: setup step succeeded" };
    }
  }
  if (active.has("sbx-failing")) {
    // Every sbx-backed surface fails together, except where fresh-setup
    // already owns the command.
    if (
      active.has("fresh-setup") &&
      (cmd === "check_setup" || cmd === "sandboxes" || cmd === "install_sbx" || cmd === "login")
    ) {
      return { kind: "pass" };
    }
    if (cmd === "launch_template") {
      // Launches stream progress through a Channel before failing.
      void channelSend(args.onProgress, { kind: "preparing" });
      return { kind: "reject", error: new Error(SBX_FAILURE) };
    }
    if (SBX_COMMANDS.includes(cmd)) {
      return { kind: "reject", error: new Error(SBX_FAILURE) };
    }
  }
  if (active.has("update-available")) {
    if (cmd === "plugin:updater|check") {
      return { kind: "resolve", value: SIMULATED_UPDATE };
    }
    // downloadAndInstall streams DownloadEvents through a Channel argument
    // and resolves with a resource id the install step echoes back.
    if (cmd === "plugin:updater|download") {
      const onEvent = args.onEvent;
      void channelSend(onEvent, { event: "Started", data: { contentLength: 1024 } });
      void channelSend(onEvent, { event: "Progress", data: { chunkLength: 1024 } });
      void channelSend(onEvent, { event: "Finished" });
      return { kind: "resolve", value: -2 };
    }
    if (cmd === "plugin:updater|install") {
      return { kind: "resolve", value: null };
    }
  }
  return { kind: "pass" };
}

/**
 * Enable (or disable) one simulation. Toggling takes effect on the next
 * IPC call; surfaces that cache their data need an explicit refresh (or a
 * remount) to re-read.
 */
export function setSim(sim: Sim, on: boolean) {
  const internals = window.__TAURI_INTERNALS__;
  if (on) active.add(sim);
  else active.delete(sim);

  const shouldShadow = active.size > 0;
  if (shouldShadow && !shadow) {
    const real = internals.invoke;
    shadow = function (cmd, args, options) {
      const result = intercept(cmd, args ?? {});
      if (result.kind === "resolve") return Promise.resolve(result.value);
      if (result.kind === "reject") return Promise.reject(result.error);
      return real.call(this, cmd, args, options);
    };
    Object.defineProperty(Object.getPrototypeOf(internals), "invoke", {
      value: shadow,
      writable: true,
      configurable: true,
    });
  } else if (!shouldShadow && shadow) {
    delete (Object.getPrototypeOf(internals) as { invoke?: unknown }).invoke;
    shadow = null;
  }
}
