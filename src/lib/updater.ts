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
    update = await check();
  } catch (error) {
    onError(toUpdateError(error));
    return false;
  }
  if (!update) {
    onState({ step: "idle" });
    return false;
  }
  const download = async () => {
    onState({ step: "downloading", downloaded: 0, total: null });
    try {
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          onState({ step: "downloading", downloaded: 0, total: event.data.contentLength ?? null });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          onState({ step: "downloading", downloaded, total: null });
        } else {
          onState({ step: "installing" });
        }
      });
      onState({
        step: "ready",
        version: update.version,
        restart: async () => {
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
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
