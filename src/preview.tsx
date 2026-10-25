/**
 * Preview entry: installs the browser IPC mock, then boots the real app.
 * Served only when the dev server is opened with ?preview=1 (see index.html).
 */
import { installPreviewMock } from "./previewMock";
import "./previewGate";
// The production entry owns this stylesheet list; the preview must match it.
import "./styles/theme.css";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/badges.css";
import "./styles/avatar.css";
import "./styles/panels.css";
import "./styles/layout.css";
import "./styles/banner.css";
import "./styles/forms.css";
import "./styles/dialog.css";
import "./styles/primitives.css";
import "./styles/options.css";
import "./styles/feedback.css";
import "./styles/groups.css";
import "./styles/steps.css";

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
