import { invoke } from "@tauri-apps/api/core";
import { shareInFlight } from "./inFlight";

/**
 * One service secret from `sbx secret ls --json`, passed through the
 * backend. `scope` is `global` or a sandbox name; `secret` is the CLI's
 * masked preview — the stored value itself is never readable.
 */
export interface ServiceSecretRecord {
  scope: string;
  type: string;
  name: string;
  secret: string;
}

/**
 * The `sbx secret ls --json` payload. `customSecrets` is passed through
 * opaquely: the CLI owns that schema, and Sandy only displays it.
 */
export interface SecretList {
  secrets: ServiceSecretRecord[];
  customSecrets: unknown[];
  shadowedServices: string[];
  envOnlyCount: number;
}

// Same dedupe as settings.ts's listSettings: StrictMode double mounts must
// not read the whole secret list twice.
export const listSecrets = shareInFlight(() =>
  invoke<SecretList>("list_secrets"),
);

/**
 * Store a new value for one secret. The backend pipes it to the CLI over
 * stdin, so the value never appears in argv or the diagnostic log.
 */
export const setSecret = (scope: string, name: string, value: string) =>
  invoke<string>("set_secret", { scope, name, value });

/** Remove one secret from its scope; the CLI keeps no history. */
export const removeSecret = (scope: string, name: string) =>
  invoke<string>("remove_secret", { scope, name });
