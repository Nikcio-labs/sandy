/**
 * Mounting for browser-mode tests: render the real app into the live
 * document instead of a string container, so axe sees a laid-out page with
 * computed styles, and every stylesheet (imported by the app modules) applies.
 *
 * `TauriMock` must be installed before importing anything from `@tauri-apps/*`
 * or app modules — the modules read `window.__TAURI_INTERNALS__` at call time,
 * but component modules run top-level code on import.
 */

import { act } from "react";
import { page } from "vite-plus/test/browser";
import { createRoot, type Root } from "react-dom/client";
import { installTauriMock, type TauriMock } from "./tauri-mock";
import { defaultHandlers } from "./fixtures";

// The same global cascade the app windows get, via the shared import list
// in src/styles/index.css — without it axe judges unstyled fallbacks.
import "../styles/index.css";

// React 19 gates `act` on this global; unflagged act environments only warn,
// once per render, which drowns real test output.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

export type Mounted = {
  root: Root;
  mock: TauriMock;
  /** Render a fresh element into the same document (replaces the old tree). */
  render: (element: React.ReactElement) => void;
  unmount: () => void;
};

export const installTauri = (): TauriMock => {
  const mock = installTauriMock("main");
  for (const [command, handler] of Object.entries(defaultHandlers)) {
    mock.handle(command, handler);
  }
  return mock;
};

export const mountApp = (element: React.ReactElement, mock: TauriMock): Mounted => {
  const host = document.createElement("div");
  host.id = "root";
  document.body.replaceChildren(host);
  const root = createRoot(host);
  const render = (next: React.ReactElement) => {
    act(() => {
      root.render(next);
    });
  };
  render(element);
  return {
    root,
    mock,
    render,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.replaceChildren();
    },
  };
};

/** Vitest's default 414×896 viewport renders the app's narrow-phone layout;
 * the desktop shell (wider rail, two-column board) is the primary surface. */
export const desktopViewport = async () => {
  await page.viewport(1280, 800);
};
