import { useEffect, useState } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Rail, Titlebar } from "./common/components/AppShell";import type { View } from "./common/components/AppShell";
import BootSplash from "./common/components/BootSplash";
import { useSetupStatus } from "./common/hooks/useSetupStatus";
import { UpdateProvider } from "./common/hooks/useUpdateProbe";
import { isSetupComplete } from "./features/setup/setupSteps";
import SandboxesPage from "./features/dashboard/components/SandboxesPage";
import TemplatesPage from "./features/templates/components/TemplatesPage";
import CreateDialog from "./features/create/components/CreateDialog";
import SettingsPage from "./features/settings/components/SettingsPage";

const revealMainWindow = async () => {
  await getCurrentWindow().show();
  // The splash may already be gone (closed by the setup window's handoff
  // after first-run setup, or by the user); ignore failures.
  await (await Window.getByLabel("splash"))?.close().catch(() => {});
};

/** Emitted by the setup window whenever it finishes a wizard pass. */
const SETUP_DONE_EVENT = "sandy://setup-done";

export default function App() {
  const [view, setView] = useState<View>("sandboxes");
  // The create wizard is a modal dialog over the current page. Edit mode
  // targets one saved template per visit.
  const [createDialog, setCreateDialog] = useState<{ templateId?: string } | null>(null);
  const [count, setCount] = useState<number | null>(null);
  // A sandbox launched elsewhere (e.g. from Templates) that the dashboard
  // should select and inspect once its list load reports it.
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const setup = useSetupStatus();
  const { status, statusError, loading, busy, setBusy, checkSetup } = setup;

  // Route to setup when the first setup check finds incomplete configuration.
  useEffect(() => {
    if (loading) return;
    // While first-run setup is pending the dedicated setup window owns the
    // screen (it reveals this window when the wizard finishes), so the main
    // window only reveals itself when there is nothing to set up.
    if (status && !isSetupComplete(status)) return;
    void revealMainWindow();
    if (statusError && !status) {
      setView("settings");
    }
    // Runs once: the first completed setup check decides the landing view.
  }, [loading]);

  // The setup window hides itself after every wizard pass; its "done" event
  // is the one moment this window's status can be stale (the wizard just
  // changed CLI state), so refresh then instead of polling focus.
  useEffect(() => {
    const registered = listen(SETUP_DONE_EVENT, () => {
      void checkSetup();
    });
    return () => {
      void registered.then((stop) => stop());
    };
  }, [checkSetup]);

  const navigate = (next: View) => {
    setView(next);
  };

  if (loading) {
    return <BootSplash />;
  }

  return (
    <UpdateProvider>
      <div className="shell">
        <Titlebar
          view={
            createDialog ? (createDialog.templateId ? "edit-template" : "create") : view
          }
        />
        <div className="app">
          <Rail view={view} busy={busy} count={count} onNavigate={navigate} />
          <main className="main" id="main-content">
            {view === "sandboxes" && (
              <SandboxesPage
                status={status}
                pendingSelection={pendingSelection}
                onPendingSelectionHandled={() => setPendingSelection(null)}
                onCreate={() => setCreateDialog({})}
                onCount={setCount}
              />
            )}
            {view === "templates" && (
              <TemplatesPage
                onCreate={() => setCreateDialog({})}
                onEdit={(templateId) => setCreateDialog({ templateId })}
                onBusyChange={setBusy}
                onLaunched={(sandbox) => {
                  setPendingSelection(sandbox);
                  setView("sandboxes");
                }}
              />
            )}
            <div hidden={view !== "settings"} className="pagehost">
              <SettingsPage
                status={status}
                statusError={statusError}
                busy={busy}
                active={view === "settings"}
                onCheckSetup={checkSetup}
              />
            </div>
          </main>
        </div>
        {createDialog && (
          <CreateDialog
            key={createDialog.templateId ?? "create"}
            templateId={createDialog.templateId}
            onBusyChange={setBusy}
            onClose={() => setCreateDialog(null)}
            onLaunched={(sandbox) => {
              setPendingSelection(sandbox);
              setView("sandboxes");
              setCreateDialog(null);
            }}
          />
        )}
      </div>
    </UpdateProvider>
  );
}
