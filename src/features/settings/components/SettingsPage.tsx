import { useState } from "react";
import type { SetupStatus } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { Pane } from "../../../common/components/Pane";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Providers from "./Providers";
import Advanced from "./Advanced";
import Updates from "./Updates";
import SandboxSettings from "./SandboxSettings";
import { PageHead } from "../../../common/components/PageHead";
import "./SettingsPage.css";

export interface SettingsPageProps {
  status: SetupStatus | null;
  statusError: string | null;
  busy: boolean;
  /** Whether Settings is the visible page (cards only load when active). */
  active: boolean;
  onCheckSetup: () => Promise<SetupStatus | null>;
}

type PaneId = "providers" | "sandbox" | "advanced";

const PANES: { id: PaneId; icon: "kit" | "settings" | "terminal"; label: string; description: string }[] = [
  {
    id: "providers",
    icon: "kit",
    label: "Kit providers",
    description: "GitHub sources for agents, workloads, and mixins",
  },
  {
    id: "sandbox",
    icon: "settings",
    label: "Sandbox settings",
    description: "Every documented sbx key, with types and defaults",
  },
  {
    id: "advanced",
    icon: "terminal",
    label: "Advanced",
    description: "Diagnostic log, errors, and command details",
  },
];

/**
 * The Settings area: updates and nested panes (home list → back-navigated
 * pane). First-run setup lives in its own window; state orchestration
 * stays in `App`.
 */
export default function SettingsPage({
  status,
  statusError,
  busy,
  active,
  onCheckSetup,
}: SettingsPageProps) {
  const [pane, setPane] = useState<PaneId | null>(null);

  const paneMeta = pane !== null ? PANES.find((item) => item.id === pane) ?? null : null;

  return (
    <div className={`settingshome ${paneMeta ? "pane-open" : ""}`}>
      {paneMeta ? (
        <Pane label={paneMeta.label} onBack={() => setPane(null)}>
          {pane === "providers" && <Providers disabled={busy} />}
          {pane === "sandbox" && <SandboxSettings />}
          {pane === "advanced" && <Advanced />}
        </Pane>
      ) : (
        <>
          <PageHead title="Settings" />
          {statusError && (
            <ErrorBanner
              title="We couldn’t check your setup."
              actionLabel="Try again"
              disabled={busy}
              onAction={() => void onCheckSetup()}
            >
              <p>{statusError}</p>
            </ErrorBanner>
          )}
          {!!status?.issues?.length && (
            <ErrorBanner
              role="status"
              title="Some setup checks are temporarily unavailable."
              actionLabel="Check again"
              disabled={busy}
              onAction={() => void onCheckSetup()}
            >
              <p>{status.issues.join("\n")}</p>
            </ErrorBanner>
          )}
          {active && (
            <div className="panel settings-stack">
              <Updates />
              <div className="settingslinks" role="group" aria-label="Settings sections">
                {PANES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="setlink"
                    onClick={() => setPane(item.id)}
                  >
                    <Icon name={item.icon} size={20} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
