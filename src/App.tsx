import { useEffect, useState } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { Rail, Titlebar } from "./common/components/AppShell";
import type { View } from "./common/components/AppShell";
import BootSplash from "./common/components/BootSplash";
import { useSetupStatus } from "./common/hooks/useSetupStatus";
import SandboxesPage from "./features/dashboard/components/SandboxesPage";
import TemplatesPage from "./features/templates/components/TemplatesPage";
import CreateDialog from "./features/create/components/CreateDialog";
import SettingsPage from "./features/settings/components/SettingsPage";

const revealMainWindow = async () => {
  await getCurrentWindow().show();
  // The splash may already be gone (e.g. the user closed it); ignore failures.
  await (await Window.getByLabel("splash"))?.close().catch(() => {});
};

export default function App() {
  const [view, setView] = useState<View>("sandboxes");
  // The create wizard is a modal dialog over the current page. Edit mode
  // targets one saved template per visit.
  const [createDialog, setCreateDialog] = useState<{ templateId?: string } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSession, setSetupSession] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  // A sandbox launched elsewhere (e.g. from Templates) that the dashboard
  // should select and inspect once its list load reports it.
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const setup = useSetupStatus();
  const {
    status,
    statusError,
    loading,
    busy,
    setBusy,
    checkSetup,
    checkingSetup,
    openSetup,
    onStepDone,
  } = setup;

  // Route to setup when the first setup check finds incomplete configuration.
  useEffect(() => {
    if (loading) return;
    // The main window is ready: reveal it and drop the boot splash.
    void revealMainWindow();
    if (statusError && !status) {
      setView("settings");
      return;
    }
    if (
      status &&
      [status.sbx_installed, status.signed_in].some((value) => value === false)
    ) {
      setView("settings");
      setSetupOpen(true);
    }
    // Runs once: the first completed setup check decides the landing view.
  }, [loading]);

  const finishSetup = () => {
    setSetupOpen(false);
    setView("sandboxes");
  };

  const navigate = (next: View) => {
    setView(next);
  };

  if (loading) {
    return <BootSplash />;
  }

  return (
    <div className="shell">
      <Titlebar
        view={
          createDialog ? (createDialog.templateId ? "edit-template" : "create") : view
        }
      />
      <div className="app">
        <Rail
          view={view}
          busy={busy}
          checkingSetup={checkingSetup}
          count={count}
          onNavigate={navigate}
        />
        <main className="main" id="main-content">
          {view === "sandboxes" && (
            <SandboxesPage
              status={status}
              pendingSelection={pendingSelection}
              onPendingSelectionHandled={() => setPendingSelection(null)}
              onGoSettings={() => setView("settings")}
              onCreate={() => setCreateDialog({})}
              onCheckSetup={checkSetup}
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
          <div hidden={view !== "settings"}>
            <SettingsPage
              status={status}
              statusError={statusError}
              busy={busy}
              checkingSetup={checkingSetup}
              setupOpen={setupOpen}
              setupSession={setupSession}
              active={view === "settings"}
              onCheckSetup={checkSetup}
              onOpenSetup={() => {
                void openSetup().then((next) => {
                  if (!next) return;
                  setSetupSession((value) => value + 1);
                  setSetupOpen(true);
                });
              }}
              onFinishSetup={finishSetup}
              onBusyChange={setBusy}
              onStepDone={onStepDone}
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
  );
}
