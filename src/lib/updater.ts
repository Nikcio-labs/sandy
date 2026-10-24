import { check } from "@tauri-apps/plugin-updater";

/** What the update flow is doing right now. */
export type UpdateState =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "available"; version: string; notes: string | null; download: () => Promise<void> }
  | { step: "downloading"; downloaded: number; total: number | null }
  | { step: "installing" }
  | { step: "ready"; version: string; restart: () => Promise<void> };

export type UpdateError = { message: string; canRetry: boolean };

/** Map any thrown value to a stable error shape with a retry hint. */
function toUpdateError(error: unknown): UpdateError {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  // The updater refuses insecure endpoints in release builds; that is a
  // configuration problem a retry cannot fix.
  const canRetry = !/insecure|not allowed|disallowed/i.test(message);
  return { message, canRetry };
}

/**
 * Check for an update and drive `onState` through the whole flow: check →
 * available → downloading → installing → ready. Resolves with `false` when
 * Sandy is already on the latest version, so callers can distinguish "no
 * update" from a failed check.
 */
export async function runUpdateCheck(
  onState: (state: UpdateState) => void,
  onError: (error: UpdateError) => void,
): Promise<boolean> {
  onState({ step: "checking" });
  let update;
  try {
    // Without a timeout a hung connection would leave the check spinner up
    // with no retry path.
    update = await check({ timeout: 30_000 });
  } catch (error) {
    onError(toUpdateError(error));
    return false;
  }
  if (!update) {
    onState({ step: "idle" });
    return false;
  }
  // One download per update object: a second click before the state flip
  // renders would start a concurrent downloadAndInstall on the same resource.
  let started = false;
  const download = async () => {
    if (started) return;
    started = true;
    onState({ step: "downloading", downloaded: 0, total: null });
    try {
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          onState({ step: "downloading", downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          onState({ step: "downloading", downloaded, total });
        } else {
          onState({ step: "installing" });
        }
      });
      onState({
        step: "ready",
        version: update.version,
        restart: async () => {
          try {
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          } catch (error) {
            // Relaunching is the user's only path into the new version, and
            // on Windows the installer already exited the app, so a failure
            // here can only be reported, never retried from this UI.
            onError({ message: String(error), canRetry: false });
          }
        },
      });
    } catch (error) {
      onError(toUpdateError(error));
    }
  };
  onState({
    step: "available",
    version: update.version,
    notes: update.body ?? null,
    download,
  });
  return true;
}
