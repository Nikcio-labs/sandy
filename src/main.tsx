import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import BootSplash from "./common/components/BootSplash";
import "./styles/theme.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/dashboard.css";
import "./styles/features.css";

// The dedicated splash window (declared in tauri.conf.json with the label
// `splash`) renders only the boot splash: a transparent, frameless window
// with the logo, a spinner, and a label.
const isSplashWindow = getCurrentWindow().label === "splash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isSplashWindow ? <BootSplash transparent /> : <App />}
  </React.StrictMode>,
);
