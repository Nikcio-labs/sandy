import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import BootSplash from "./common/components/BootSplash";
import SetupWindow from "./common/components/SetupWindow";
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
