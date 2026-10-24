import { getCurrentWindow } from "@tauri-apps/api/window";
import type { IconName } from "./Icon";
import Icon from "./Icon";
import logo from "../../assets/logo.png";
export type View = "home" | "sandboxes" | "templates" | "settings" | "create" | "edit-template";

const navigation: {
  id: Exclude<View, "create">;
  icon: IconName;
  label: string;
}[] = [
  { id: "home", icon: "home", label: "Home" },
  { id: "sandboxes", icon: "box", label: "Sandboxes" },
  { id: "templates", icon: "template", label: "Templates" },
  { id: "settings", icon: "settings", label: "Settings" },
];

/**
 * The window has no OS decorations, so the custom buttons must cover
 * minimize, maximize-restore, and close. Without OS decorations there is
 * no native close-requested flow to interrupt, so closing directly is the
 * whole behavior; nothing in the app listens for close requests.
 */
function WindowControls() {
  const window = getCurrentWindow();
  // Rejections only occur if the capability grants are removed; they are
  // swallowed to avoid unhandled rejections, matching the splash close in
  // App.tsx.
  const controls: { label: string; action: () => void; icon: React.ReactNode }[] = [
    { label: "Minimize window", action: () => window.minimize().catch(() => {}), icon: <span className="window-control-minimize" /> },
    { label: "Maximize or restore window", action: () => window.toggleMaximize().catch(() => {}), icon: <span className="window-control-maximize" /> },
    {
      label: "Close window",
      action: () => window.close().catch(() => {}),
      icon: <Icon name="close" size={16} />,
    },
  ];

  return (
    <div className="window-controls">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          className="window-control"
          aria-label={control.label}
          onClick={control.action}
        >
          {control.icon}
        </button>
      ))}
    </div>
  );
}

export function Topbar() {
  return (
    // Draggable title bar. The "deep" value makes every non-interactive part
    // of the subtree draggable; interactive children (buttons) stay clickable
    // and double-click on the bar still toggles maximize (Tauri drag-region
    // script). Elements carrying the attribute must remain hit-testable, so
    // the bar itself never sets pointer-events: none.
    <header className="topbar" data-tauri-drag-region="deep">
      <div className="brand">
        <img src={logo} alt="" />
        <span>Sandy</span>
      </div>
      <WindowControls />
    </header>
  );
}

export function Sidebar({
  view,
  busy,
  checkingSetup,
  count,
  onNavigate,
  onViewGuide,
}: {
  view: View;
  busy: boolean;
  checkingSetup: boolean;
  count: number | null;
  onNavigate: (view: Exclude<View, "create" | "edit-template">) => void;
  /** Replaces the guide link while the guide view is not built yet. */
  onViewGuide: () => void;
}) {
  return (
    <aside className="sidebar">
      <nav className="nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${
              view === item.id ||
              (view === "create" && item.id === "home") ||
              (view === "edit-template" && item.id === "templates")
                ? "active"
                : ""
            }`}
            aria-current={
              view === item.id ||
              (view === "create" && item.id === "home") ||
              (view === "edit-template" && item.id === "templates")
                ? "page"
                : undefined
            }
            disabled={busy || checkingSetup}
            onClick={() => onNavigate(item.id as Exclude<View, "create" | "edit-template">)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === "sandboxes" && count !== null && <span className="nav-count">{count}</span>}
          </button>
        ))}
      </nav>
      <div className="help-card">
        <div className="help-title">
          <Icon name="bulb" size={19} /> Need help?
        </div>
        <p>Check out our guide on how to use sandboxes.</p>
        <button type="button" className="link-button" onClick={onViewGuide}>
          View guide <Icon name="arrow" size={15} />
        </button>
      </div>
    </aside>
  );
}
