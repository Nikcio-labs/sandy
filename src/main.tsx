import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import BootSplash from "./common/components/BootSplash";
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

// The dedicated splash window (declared in tauri.conf.json with the label
// `splash`) renders only the boot splash: a transparent, frameless window
// with the logo, a spinner, and a label.
const isSplashWindow = getCurrentWindow().label === "splash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isSplashWindow ? <BootSplash transparent /> : <App />}
  </React.StrictMode>,
);
