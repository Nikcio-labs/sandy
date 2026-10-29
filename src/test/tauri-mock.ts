/**
 * Browser-mode stand-in for the Tauri IPC bridge: `__TAURI_INTERNALS__` is the
 * single integration point every `@tauri-apps/api` module funnels through
 * (invoke, transformCallback, and the current-window metadata), so installing
 * it before importing app code lets the whole UI run against fixture data.
 *
 * Command handlers are plain maps, so a test can seed exactly the state a
 * surface renders. Handlers either return a value or throw with the message
 * the backend would produce (the CLI's stderr is surfaced through app errors).
 */

type Handler = (args: Record<string, unknown>) => unknown;

export type TauriMock = {
  /** Set (or replace) a command handler. */
  handle: (command: string, handler: Handler) => void;
  /** The handlers currently installed. */
  handlers: Map<string, Handler>;
};

export function installTauriMock(label = "main"): TauriMock {
  const handlers = new Map<string, Handler>();
  const listeners: {
    event: string;
    handler: (event: { event: string; payload: unknown; id: number; windowLabel: string }) => void;
  }[] = [];

  type CallbackMessage = { event: string; id: number; payload: unknown };

  const internals = {
    metadata: { currentWindow: { label }, currentWebview: { label } },
    invoke: (command: string, args: Record<string, unknown> = {}) => {
      const handler = handlers.get(command);
      if (!handler) {
        return Promise.reject(new Error(`unmocked command: ${command}`));
      }
      try {
        return Promise.resolve(handler(args));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    transformCallback: (callback: (response: CallbackMessage) => void, once = false): number => {
      const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      const slots = window as unknown as Record<string, unknown>;
      slots[`_${id}`] = (response: CallbackMessage) => {
        if (once) delete slots[`_${id}`];
        callback(response);
      };
      return id;
    },
    convertFileSrc: (filePath: string) => `asset://localhost/${filePath}`,
  };

  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = internals;
  // The event plugin's `_unlisten` reaches for this registry on every unlisten.
  (window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  const callbackFor = (callbackId: number) =>
    (window as unknown as Record<string, unknown>)[`_${callbackId}`] as
      | ((response: CallbackMessage) => void)
      | undefined;

  // Event listeners resolve through the mocked invoke, so the event
  // plugin's register call goes through the handler map like any command.
  handlers.set("plugin:event|listen", (args) => {
    const callback = callbackFor(args.handler as number);
    if (callback) {
      listeners.push({ event: args.event as string, handler: callback });
    }
    return listeners.length;
  });
  handlers.set("plugin:event|unlisten", () => {});
  // Window getters and window-control actions (the frameless window's
  // minimize/maximize/close and the reveal flow).
  handlers.set("plugin:window|get_all_windows", () => [label]);
  for (const action of [
    "show",
    "hide",
    "close",
    "minimize",
    "unminimize",
    "maximize",
    "unmaximize",
    "toggle_maximize",
    "set_focus",
    "inner_position",
    "outer_position",
    "inner_size",
    "outer_size",
    "is_fullscreen",
    "is_minimized",
    "is_maximized",
    "is_focused",
    "is_visible",
    "title",
    "current_monitor",
    "primary_monitor",
    "scale_factor",
  ]) {
    handlers.set(`plugin:window|${action}`, () =>
      action === "scale_factor"
        ? 1
        : action === "title"
          ? "Sandy"
          : action.endsWith("_size")
            ? { width: 1280, height: 800 }
            : action.endsWith("_position")
              ? { x: 0, y: 0 }
              : action.endsWith("_monitor")
                ? null
                : action.startsWith("is_")
                  ? false
                  : null,
    );
  }
  handlers.set("plugin:updater|check", () => null);
  handlers.set("plugin:app|version", () => "0.1.0");

  return {
    handle: (command, handler) => handlers.set(command, handler),
    handlers,
  };
}
