import { invoke } from "@tauri-apps/api/core";

/** One stored secret as reported by `sbx secret ls --json`. */
export interface SecretEntry {
  /** "global", a sandbox name, or "host-only" (registry credentials). */
  scope: string;
  type: string;
  name: string;
  secret: string;
  /** Custom secrets route by target host instead of a service name. */
  targets: string[];
  /** Custom secrets set this environment variable inside the sandbox. */
  env: string;
  /** Custom secrets are removed by their placeholder, not a service name. */
  placeholder: string;
}

/** A credential service a kit asks the proxy to authenticate (e.g. "github"). */
export interface KitCredential {
  service: string;
  required: boolean;
}

/**
 * Scope of a stored secret. `"global"` covers every sandbox, `"sandbox"` is
 * stored under one sandbox's name.
 */
export type SecretScope = "global" | "sandbox";

export const listSecrets = (scope?: "global" | { sandbox: string }) =>
  invoke<SecretEntry[]>("list_secrets", {
    scope:
      scope === undefined
        ? null
        : scope === "global"
          ? ""
          : scope.sandbox,
  });

export const setSecret = (
  service: string,
  value: string,
  scope?: "global" | { sandbox: string },
  force = false,
) =>
  invoke<string>("set_secret", {
    service,
    value,
    scope:
      scope === undefined || scope === "global"
        ? null
        : scope.sandbox,
    force,
  });

export const deleteSecret = (
  service: string,
  scope?: "global" | { sandbox: string },
) =>
  invoke<string>("delete_secret", {
    service,
    scope:
      scope === undefined || scope === "global"
        ? null
        : scope.sandbox,
    placeholder: null,
    registry: false,
  });
