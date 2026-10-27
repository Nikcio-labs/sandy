import { invoke } from "@tauri-apps/api/core";
import { shareInFlight } from "./inFlight";

/**
 * One record from `sbx settings ls --json`, passed through the backend.
 * `value`/`default` are raw JSON values; `error` marks a setting the CLI
 * could not read (e.g. an administrator-managed key) — the value is
 * unknown, not false or empty.
 */
export interface SettingRecord {
  key: string;
  type: string;
  description: string;
  default?: unknown;
  value?: unknown;
  source: string;
  env_var?: string;
  requires_restart?: boolean;
  options?: string[];
  error?: string;
}

// Same dedupe as sandbox.ts's checkSetup: StrictMode double mounts must not
// read the whole settings list twice.
export const listSettings = shareInFlight(() =>
  invoke<SettingRecord[]>("list_settings"),
);
/** Set a user override; the CLI parses the raw JSON value by setting type. */
export const setSetting = (key: string, value: unknown) =>
  invoke<string>("set_setting", { key, valueJson: JSON.stringify(value) });
/** Remove a user override; the setting evaluates from env/default again. */
export const unsetSetting = (key: string) =>
  invoke<string>("unset_setting", { key });
