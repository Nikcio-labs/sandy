/**
 * Preview entry: installs the browser IPC mock, then boots the real app.
 * Served only when the dev server is opened with ?preview=1 (see index.html).
 */
import { installPreviewMock } from "./previewMock";
import "./previewGate";

installPreviewMock();

const boot = async () => {
  const { default: App } = await import("./App");
  const React = await import("react");
  const ReactDOM = await import("react-dom/client");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  // The app calls getCurrentWindow().show() at startup; the browser mock
  // never opens a real window, so resolve the promise chain harmlessly.
  void getCurrentWindow;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  );
};

void boot();
