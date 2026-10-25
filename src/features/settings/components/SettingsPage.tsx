import { useState } from "react";
import type { SetupStatus } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import Providers from "./Providers";
import Advanced from "./Advanced";
import Updates from "./Updates";
import SandboxSettings from "./SandboxSettings";
import SetupWizard from "../../setup/components/SetupWizard";
import { isSetupComplete } from "../../setup/setupSteps";
import { PageHead } from "../../../common/components/PageHead";
import "./SettingsPage.css";

export interface SettingsPageProps {
  status: SetupStatus | null;
  statusError: string | null;
  busy: boolean;
  checkingSetup: boolean;
  /** Whether the setup wizard is currently open (vs. the summary card). */
  setupOpen: boolean;
  /** Bumped to remount the wizard for a fresh setup pass. */
  setupSession: number;
  /** Whether Settings is the visible page (cards only load when active). */
  active: boolean;
  onCheckSetup: () => Promise<SetupStatus | null>;
  onOpenSetup: () => void;
  onFinishSetup: () => void;
  onBusyChange: (busy: boolean) => void;
  onStepDone: (step: string) => void;
}

type Pane = "providers" | "sandbox" | "advanced";

const PANES: { id: Pane; icon: "kit" | "settings" | "terminal"; label: string; description: string }[] = [
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
 * The Settings area: setup summary or wizard, status banners, and nested
 * panes (home list → back-navigated pane) matching the design study. State
 * orchestration stays in `App`; the wizard flow lives in `features/setup`.
 */
export default function SettingsPage({
  status,
  statusError,
  busy,
  checkingSetup,
  setupOpen,
  setupSession,
  active,
  onCheckSetup,
  onOpenSetup,
  onFinishSetup,
  onBusyChange,
  onStepDone,
}: SettingsPageProps) {
  const [pane, setPane] = useState<Pane | null>(null);

  return (
    <div className="settingshome">
      {pane === null ? (
        <>
          <PageHead
            title="Settings"
            subtitle="Sources, host access, and the details behind your sandboxes."
          />
          {statusError && (
            <div className="banner error" role="alert">
              <strong>We couldn’t check your setup.</strong>
              <p>{statusError}</p>
              <button className="btn small" disabled={busy || checkingSetup} onClick={() => void onCheckSetup()}>
                Try again
              </button>
            </div>
          )}
          {!!status?.issues?.length && (
            <div className="banner error" role="status">
              <strong>Some setup checks are temporarily unavailable.</strong>
              <p>{status.issues.join("\n")}</p>
              <button className="btn small" disabled={busy || checkingSetup} onClick={() => void onCheckSetup()}>
                Check again
              </button>
            </div>
          )}
          {!!status?.warnings?.length && (
            <div className="banner" role="status">
              <strong>A setup check may be a false alarm.</strong>
              {status.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          {!!status?.ssh_explanation?.detail && status.ssh_explanation.detail !== status.ssh_explanation.message && (
            <details className="explanation-details">
              <summary>SSH check details</summary>
              <pre>{status.ssh_explanation.detail}</pre>
              {status.ssh_explanation.hint && <p>{status.ssh_explanation.hint}</p>}
            </details>
          )}
          {setupOpen ? (
            <SetupWizard
              key={setupSession}
              status={status}
              onCheckSetup={onCheckSetup}
              onDone={onFinishSetup}
              onBusyChange={onBusyChange}
              onStepDone={onStepDone}
            />
          ) : (
            <section className="panel" aria-busy={checkingSetup}>
              <div className="updatecard">
                <div className="split">
                  <h2>
                    {status &&
                    [status.signed_in, status.sbx_installed].some((value) => value === null)
                      ? "Setup status is temporarily unavailable"
                      : isSetupComplete(status)
                        ? "You’re all set"
                        : "Let’s get you set up"}
                  </h2>
                  <button className="btn primary" disabled={busy || checkingSetup} onClick={onOpenSetup}>
                    {checkingSetup ? (
                      <>
                        <span className="spinner" /> Checking setup…
                      </>
                    ) : (
                      <>
                        {isSetupComplete(status) ? "Review setup" : "Continue setup"}
                      </>
                    )}
                  </button>
                </div>
                <p>
                  {isSetupComplete(status)
                    ? "Your local sandbox tools are configured and ready to use."
                    : "A few simple steps to get your sandbox tools ready."}
                </p>
              </div>
            </section>
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
      ) : (
        <section className="panel settingspane" data-pane={pane}>
          <header className="panehead">
            <button
              type="button"
              className="iconbtn"
              aria-label="Back to settings"
              onClick={() => setPane(null)}
            >
              <Icon name="back" size={18} />
            </button>
            <h2 tabIndex={-1}>{PANES.find((item) => item.id === pane)!.label}</h2>
          </header>
          <div className="panecontent">
            {pane === "providers" && <Providers disabled={busy || checkingSetup} />}
            {pane === "sandbox" && <SandboxSettings />}
            {pane === "advanced" && <Advanced />}
          </div>
        </section>
      )}
    </div>
  );
}
