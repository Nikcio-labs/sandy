/// <reference types="vite/client" />

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>;
  transformCallback: (callback: (data: unknown) => void, once?: boolean) => number;
  unregisterCallback: (id: number) => void;
  runCallback?: (id: number, data: unknown) => void;
  [key: string]: unknown;
}

interface Window {
  __TAURI_INTERNALS__: TauriInternals;
}

declare module "*.css";

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}
