/**
 * Shims the Tauri window/plugin APIs that touch a real desktop shell when
 * running under the preview mock. Imported only from preview.tsx.
 */
const noop = () => {};

// getCurrentWindow().show() and the splash close run at startup; provide a
// WebWindow stub through the same internals object the API reads.
const internals = (window as unknown as Record<string, unknown>);
const existing = internals.__TAURI_INTERNALS__ as Record<string, unknown> | undefined;

if (existing && !existing.metadata) {
  existing.metadata = { currentWindow: { label: "main" }, currentWebview: { label: "main" } };
}

window.addEventListener("error", (event) => {
  // Unhandled plugin rejections (opener, updater, process) are expected in
  // the preview; keep the console usable for real errors only.
  if (String(event.message).includes("__TAURI")) event.preventDefault();
});

export const previewReady = noop;
