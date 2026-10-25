import { Channel, invoke } from "@tauri-apps/api/core";
import { shareInFlight } from "./inFlight";
import type { LaunchTemplateRequest } from "./templates";

/** The CLI's own explanation of a diagnose check's verdict. */
export interface CheckExplanation {
  message: string;
  detail?: string | null;
  hint?: string | null;
}

export interface SetupStatus {
  sbx_installed: boolean;
  signed_in: boolean | null;
  image_paste_on: boolean | null;
  ssh_set_up: boolean | null;
  /** The CLI's explanation of the Authentication verdict. */
  auth_explanation?: CheckExplanation | null;
  /** The CLI's explanation of the SSH config verdict. */
  ssh_explanation?: CheckExplanation | null;
  /** Non-blocking notes about checks whose verdicts may be false alarms. */
  warnings?: string[];
  issues?: string[];
}
export interface SandboxInfo {
  name: string;
  state: string;
  agent: string;
  workspace: string;
  raw: string;
}

export interface ConnectionInfo {
  host: string;
  user: string;
  port?: number;
  command: string;
}

// The full setup check (daemon probe, diagnose, settings read) shares one
// invoke: StrictMode double effects and overlapping callers must not each
// spawn the same CLI work.
export const checkSetup = shareInFlight(() => invoke<SetupStatus>("check_setup"));
/** Reveal the main window (and close the splash) from the setup window. */
export const revealMain = () => invoke<void>("reveal_main");
/** Close the boot splash from the setup window before the wizard shows. */
export const closeSplash = () => invoke<void>("close_splash");
/** Quit the whole app from the setup window's close button. */
export const quitApp = () => invoke<void>("quit_app");
/** Reopen the setup window after the user skipped first-run setup. */
export const openSetupWindow = () => invoke<void>("open_setup_window");
/** Open the sbx installer in a visible terminal (sudo/winget prompts). */
export const openInstallerTerminal = () => invoke<void>("open_installer_terminal");
export const enableImagePaste = () => invoke<void>("enable_image_paste");
export const setupSsh = () => invoke<string>("setup_ssh");
export const login = () => invoke<string>("login");
// Same dedupe as checkSetup: mount + focus can overlap on one list read.
export const listSandboxes = shareInFlight(() => invoke<SandboxInfo[]>("sandboxes"));
export const startSandbox = (name: string) => invoke<string>("start_sandbox", { name });
export const stopSandbox = (name: string) => invoke<string>("stop_sandbox", { name });
export const restartSandbox = (name: string) => invoke<string>("restart_sandbox", { name });
export const openTerminal = (name: string) => invoke<void>("open_terminal", { name });
export const connectionInfo = (name: string) =>
  invoke<ConnectionInfo>("connection_info", { name });

/** Phases and console lines reported while a template launch runs. */
export type LaunchProgress =
  | { kind: "preparing" }
  | { kind: "authorizing" }
  | { kind: "creating" }
  | { kind: "starting" }
  | { kind: "ready" }
  | { kind: "output"; text: string };

const launchPhaseLabels: Record<Exclude<LaunchProgress["kind"], "output">, string> = {
  preparing: "Preparing the sandbox environment…",
  authorizing: "Authorizing the kit source…",
  creating: "Creating the sandbox image and container…",
  starting: "Starting the sandbox…",
  ready: "Sandbox is ready.",
};

export const launchPhaseLabel = (progress: LaunchProgress) =>
  progress.kind === "output" ? null : launchPhaseLabels[progress.kind];

export const launchTemplate = (
  request: LaunchTemplateRequest,
  onProgress: (progress: LaunchProgress) => void,
) => {
  const channel = new Channel<LaunchProgress>();
  channel.onmessage = onProgress;
  return invoke<string>("launch_template", { ...request, onProgress: channel });
};
