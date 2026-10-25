import { useEffect, useState } from "react";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Icon from "../../../common/components/Icon";
import { useAppVersion } from "../../../common/hooks/useAppVersion";
import { checkSetup } from "../../../lib/sandbox";
import { setSim, isSimActive, type Sim } from "../../../common/dev/devSims";
import "./DevPane.css";

/**
 * Settings → Developer: toggle points for exercising setup, CLI-failure,
 * and update flows without a real backend state. Compiled out of
 * production builds entirely (the pane is only referenced behind
 * `import.meta.env.DEV`).
 */

const SIMS: { id: Sim; label: string; description: string }[] = [
  {
    id: "fresh-setup",
    label: "Fresh setup",
    description:
      "Report the CLI as missing and nothing configured, so the setup wizard and empty dashboard can be walked through.",
  },
  {
    id: "sbx-failing",
    label: "sbx CLI failing",
    description:
      "Fail every sbx command — list, actions, settings, launch, setup checks — to exercise the error states.",
  },
  {
    id: "update-available",
    label: "Update available",
    description:
      "Make the updater report a newer version, so the rail marker and the Settings download flow can be tested.",
  },
];

export default function DevPane() {
  const version = useAppVersion();
  const [enabled, setEnabled] = useState<Record<Sim, boolean>>(() => ({
    "fresh-setup": isSimActive("fresh-setup"),
    "sbx-failing": isSimActive("sbx-failing"),
    "update-available": isSimActive("update-available"),
  }));
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Deactivating a sim must re-read real state: setup gates the dashboard
  // and landing view, so a stale simulated verdict would linger otherwise.
  useEffect(() => {
    if (Object.values(enabled).some(Boolean)) return;
    setStatusError(null);
    setChecking(true);
    void checkSetup()
      .then((next) => {
        setStatus(
          next
            ? `Real setup check: sbx ${next.sbx_installed ? "installed" : "missing"}, signed in: ${String(next.signed_in)}`
            : "Real setup check returned nothing.",
        );
      })
      .catch((error) => setStatusError(String(error)))
      .finally(() => setChecking(false));
  }, [enabled]);

  const toggle = (sim: Sim, on: boolean) => {
    setSim(sim, on);
    setEnabled((previous) => ({ ...previous, [sim]: on }));
  };

  return (
    <section className="pane-section devpane">
      <p className="paneintro">
        Development-only toggles: they fake backend state so flows can be exercised without
        un-installing anything. Disabled in production builds. Changes apply to the next data read —
        lists need a refresh, and pages may need to be revisited.
      </p>
      <p className="devversion">
        Current version: <code>{version ?? "unknown"}</code>
      </p>
      {statusError && (
        <ErrorBanner title="The real setup check failed.">
          <p>{statusError}</p>
        </ErrorBanner>
      )}
      {checking && (
        <p className="statusline" role="status">
          <span className="spinner" /> Running the real setup check…
        </p>
      )}
      {status && (
        <p className="devstatus" role="status">
          <Icon name="info" size={15} /> {status}
        </p>
      )}
      <div className="devtoggles">
        {SIMS.map((sim) => (
          <label key={sim.id} className="check devtoggle">
            <input
              type="checkbox"
              checked={enabled[sim.id]}
              onChange={(event) => toggle(sim.id, event.target.checked)}
            />
            <span>
              <strong>{sim.label}</strong>
              <small>{sim.description}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
