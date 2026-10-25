import { getCurrentWindow } from "@tauri-apps/api/window";
import type { IconName } from "./Icon";
import Icon from "./Icon";
import logo from "../../assets/logo.png";
import "./AppShell.css";

export type View = "sandboxes" | "templates" | "settings" | "create" | "edit-template";

const navigation: {
  id: Exclude<View, "create" | "edit-template">;
  icon: IconName;
  label: string;
}[] = [
  { id: "sandboxes", icon: "box", label: "Sandboxes" },
  { id: "templates", icon: "template", label: "Templates" },
  { id: "settings", icon: "settings", label: "Settings" },
];

const titles: Record<View, string> = {
  sandboxes: "Your sandboxes",
  templates: "Templates",
  settings: "Settings",
  create: "Create a sandbox",
  "edit-template": "Edit template",
};

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
    { label: "Minimize window", action: () => window.minimize().catch(() => {}), icon: <span className="wincontrol-minimize" /> },
    { label: "Maximize or restore window", action: () => window.toggleMaximize().catch(() => {}), icon: <span className="wincontrol-maximize" /> },
    {
      label: "Close window",
      action: () => window.close().catch(() => {}),
      icon: <Icon name="close" size={16} />,
    },
  ];

  return (
    <div className="wincontrols">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          aria-label={control.label}
          onClick={control.action}
        >
          {control.icon}
        </button>
      ))}
    </div>
  );
}

export function Titlebar({ view }: { view: View }) {
  return (
    // Draggable title bar. The "deep" value makes every non-interactive part
    // of the subtree draggable; interactive children (buttons) stay clickable
    // and double-click on the bar still toggles maximize (Tauri drag-region
    // script). Elements carrying the attribute must remain hit-testable, so
    // the bar itself never sets pointer-events: none.
    <header className="titlebar" data-tauri-drag-region="deep">
      <div className="titlebrand">
        <img src={logo} alt="" />
        <span>Sandy</span>
      </div>
      <span className="wintitle" aria-hidden="true">
        {titles[view]}
      </span>
      <WindowControls />
    </header>
  );
}

export function Rail({
  view,
  busy,
  checkingSetup,
  count,
  onNavigate,
}: {
  view: View;
  busy: boolean;
  checkingSetup: boolean;
  count: number | null;
  onNavigate: (view: Exclude<View, "create" | "edit-template">) => void;
}) {
  return (
    <aside className="rail" aria-label="App navigation">
      <nav className="railnav">
        {navigation.map((item) => {
          const active =
            view === item.id ||
            (view === "create" && item.id === "templates") ||
            (view === "edit-template" && item.id === "templates");
          return (
            <button
              key={item.id}
              className={item.id === "settings" ? "navsettings" : undefined}
              aria-current={active ? "page" : undefined}
              disabled={busy || checkingSetup}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "sandboxes" && count !== null && (
                <span className="badge railcount">{count}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="railfoot">
        <span>
          <i />
          On this computer
        </span>
        Local sandboxes only
      </div>
    </aside>
  );
}
