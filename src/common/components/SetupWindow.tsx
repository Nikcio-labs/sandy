import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import type { SetupStatus } from "../../lib/sandbox";
import { checkSetup, closeSplash, revealMain } from "../../lib/sandbox";import { isSetupComplete } from "../../features/setup/setupSteps";
import SetupWizard from "../../features/setup/components/SetupWizard";
import logo from "../../assets/logo.png";
import "./SetupWindow.css";

/** The main window refreshes its setup status when the setup window leaves. */
const SETUP_DONE_EVENT = "sandy://setup-done";

/**
 * The dedicated first-run setup window: after the splash, the check decides
 * between handing off to the main window and showing the wizard. It starts
 * hidden and shows itself only when setup work is found; reopened later
 * (sandboxes banner), the focus listener re-runs the check.
 */
export default function SetupWindow() {
  /** The check has not answered yet: show nothing (the splash still covers). */
  const [decided, setDecided] = useState(false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  /** Set once the main window is revealed; the setup window then hides. */
  const [handedOff, setHandedOff] = useState(false);
  /** Whether the wizard was shown, i.e. CLI state may have changed. */
  const wizardShown = useRef(false);

  const handOff = useCallback((announce: boolean) => {
    setHandedOff(true);
    const reveal = revealMain().catch(() => {});
    // A wizard pass may have changed CLI state; the main window's copy of
    // the status is stale until it re-checks, which the event tells it to
    // do. A plain boot handoff changed nothing — skip the extra check.
    if (announce) void reveal.then(() => emit(SETUP_DONE_EVENT).catch(() => {}));
    void reveal.then(() => getCurrentWindow().hide());
  }, []);

  const decide = useCallback(
    (next: SetupStatus | null) => {
      setStatus(next);
      setDecided(true);
      if (next && isSetupComplete(next)) {
        handOff(false);
      } else {
        wizardShown.current = true;
        // First run: drop the splash (always-on-top, it would cover the
        // wizard) and step forward. Reopened later: already visible.
        void closeSplash()
          .catch(() => {})
          .then(() => getCurrentWindow().show());
      }
    },
    [handOff],
  );

  useEffect(() => {
    let active = true;
    void checkSetup()
      .then((next) => {
        if (active) decide(next);
      })
      .catch(() => {
        // The check failed (e.g. a CLI crash): let the main window's error
        // handling take over instead of trapping the user in setup.
        if (active) handOff(false);
      });
    return () => {
      active = false;
    };
  }, [decide, handOff]);

  // The window stays mounted after first-run setup; when the sandboxes
  // banner reopens it, refresh the verdict instead of replaying stale state.
  useEffect(() => {
    const window = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const registered = window.onFocusChanged(({ payload: focused }) => {
      if (!focused || document.visibilityState !== "visible") return;
      setHandedOff(false);
      // Time has passed since the last verdict (the user may have run setup
      // commands themselves); always re-check on focus.
      void checkSetup().then(decide);
    });
    registered
      .then((stop) => {
        unlisten = stop;
        return undefined;
      })
      .catch(() => {});
    return () => {
      void registered.then(() => unlisten?.());
    };
  }, [decide]);

  if (!decided || handedOff || !status) return null;

  return (
    <div className="setupwindow">
      <header className="setupwindow-bar" data-tauri-drag-region>
        <img src={logo} alt="" />
        <span>Sandy</span>
      </header>
      <div className="setupwindow-body">
        <SetupWizard
          status={status}
          onCheckSetup={checkSetup}
          onDone={() => handOff(wizardShown.current)}
          onBusyChange={() => {}}
          onStepDone={() => {}}
        />
      </div>
    </div>
  );
}
