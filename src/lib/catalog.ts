import { invoke } from "@tauri-apps/api/core";
import { shareInFlight } from "./inFlight";

export interface Provider {
  id: string;
  label: string;
  kind: "github";
  repository: string;
  reference: string;
  enabled: boolean;
}

export interface KitArgument {
  name: string;
  description: string;
  required: boolean;
  default: string | null;
  choices: string[];
}

export interface KitOption {
  id: string;
  name: string;
  description: string;
  source: string;
  schema_version: 2 | 3;
  kind: "agent" | "workload" | "mixin";
  provider_id: string;
  required_agent: string | null;
  arguments: KitArgument[];
}

export interface Catalog {
  kits: KitOption[];
  warnings: string[];
}

export type KitArguments = Record<string, Record<string, string>>;

// Same dedupe as sandbox.ts's checkSetup: StrictMode double mounts must not
// read the provider store twice.
export const getProviders = shareInFlight(() => invoke<Provider[]>("get_providers"));
export const saveProviders = (providers: Provider[]) =>
  invoke<Provider[]>("save_providers", { providers });
export const providerVersions = (provider: Provider, refresh?: boolean) =>
  invoke<string[]>("provider_versions", { provider, ...(refresh ? { refresh: true } : {}) });
export const discoverKits = (providers: Provider[], refresh?: boolean) =>
  invoke<Catalog>("discover_kits", {
    providers,
    ...(refresh ? { refresh: true } : {}),
  });
export const pickWorkspace = () => invoke<string | null>("pick_workspace");
export const pickTemplatePath = () => invoke<string | null>("pick_template_path");

/** The stored GitHub token, or null when none is saved. The token itself is
 * never sent back to the UI; callers only learn that one exists. */
export interface GithubTokenStatus {
  saved: boolean;
}

export const getGithubToken = () =>
  invoke<GithubTokenStatus>("get_github_token");
export const saveGithubToken = (token: string) =>
  invoke<void>("save_github_token", { token });

/** One structured entry from the Sandy diagnostic log (JSON Lines on disk). */
export interface DebugLogEntry {
  timestamp: string;
  /** Log target: `cli`, `http`, `command`, `app`, or a dependency crate name. */
  kind: string;
  summary: string;
  detail?: string;
  outcome?: "ok" | "error";
}

/** The whole diagnostic log file. Empty when nothing has been logged yet. */
export const readDebugLog = () => invoke<string>("read_debug_log");
export const clearDebugLog = () => invoke<void>("clear_debug_log");
/** Directory containing the diagnostic log file, for opening it in a file manager. */
export const debugLogDir = () => invoke<string>("debug_log_dir");
