import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import BootSplash from "./common/components/BootSplash";
import SetupWindow from "./common/components/SetupWindow";
import "./styles/index.css";

// Window-specific roots: the splash is a transparent, frameless boot
// screen; the setup window is the first-run wizard (see tauri.conf.json).
// Each renders on its own; only the main window runs the full app.
const windowLabel = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {windowLabel === "splash" ? (
      <BootSplash transparent />
    ) : windowLabel === "setup" ? (
      <SetupWindow />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
