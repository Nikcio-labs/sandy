import { useEffect, useId, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import Icon from "../../../common/components/Icon";
import { useUpdater } from "../../../common/hooks/useUpdater";
import "./Updates.css";

// Settings mounts and unmounts this card on every navigation; the automatic
// check runs once per app session, like the startup setup check.
let checkedThisSession = false;

/**
 * Settings → Updates: checks GitHub Releases for a newer Sandy, downloads it
 * with a progress bar, and restarts into the new version. The updater plugin
 * verifies the release signature before anything is installed.
 */
export default function Updates() {
  const id = useId();
  const { state, error, busy, check, dismiss } = useUpdater();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getVersion()
      .then((current) => {
        if (active) setVersion(current);
      })
      .catch(() => {
        // The version badge is informational; a failed read stays hidden.
      });
    return () => {
      active = false;
    };
  }, []);

  // StrictMode mounts effects twice; the ref keeps the automatic check
  // single-shot per component instance.
  const checkedOnMount = useRef(false);
  useEffect(() => {
    if (checkedOnMount.current || checkedThisSession) return;
    checkedOnMount.current = true;
    checkedThisSession = true;
    check();
  }, [check]);

  const progress =
    state.step === "downloading" && state.total !== null
      ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
      : null;

  return (
    <section
      className="group group-body"
      aria-labelledby={`${id}-title`}
      aria-busy={state.step === "checking"}
    >
      <div className="sectionhead">
        <div>
          <h2 id={`${id}-title`}>Updates</h2>
          <p className="help intro">
            Sandy can check for new versions and update itself in place; you just confirm the
            restart.
          </p>
        </div>
        {version && <span className="badge pill">Version {version}</span>}
      </div>

      {error && (
        <ErrorBanner
          title={error.canRetry ? "Sandy could not check for updates." : "Updating is not available."}
          actionLabel={error.canRetry ? "Try again" : undefined}
          onAction={error.canRetry ? check : undefined}
          disabled={busy}
        >
          <p>{error.message}</p>
        </ErrorBanner>
      )}

      {state.step === "idle" && !error && (
        <div className="actionbar">
          <button type="button" className="btn" onClick={check} disabled={busy}>
            <Icon name="refresh" size={16} />
            Check for updates
          </button>
        </div>
      )}

      {state.step === "checking" && (
        <p className="statusline" role="status">
          <span className="spinner" /> Checking for updates…
        </p>
      )}

      {state.step === "available" && (
        <div className="update-offer">
          <p>
            <strong>Sandy {state.version}</strong> is available.
            {state.notes && <span className="help"> {state.notes}</span>}
          </p>
          <div className="actionbar">
            <button type="button" className="btn primary" onClick={() => void state.download()}>
              Download update
            </button>
            <button type="button" className="btn" onClick={dismiss}>
              Not now
            </button>
          </div>
        </div>
      )}

      {state.step === "downloading" && (
        <div className="update-progress">
          <p className="setup-progress-label">
            {progress !== null ? `Downloading… ${progress}%` : "Downloading…"}
          </p>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? undefined}
          >
            <span style={{ width: `${progress ?? 0}%` }} />
          </div>
        </div>
      )}

      {state.step === "installing" && (
        <p className="statusline" role="status">
          <span className="spinner" /> Installing update…
        </p>
      )}

      {state.step === "ready" && (
        <div className="update-offer">
          <p>
            <strong>Sandy {state.version}</strong> is installed. Restart to start using it.
          </p>
          <div className="actionbar">
            <button type="button" className="btn primary" onClick={() => void state.restart()}>
              Restart now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
