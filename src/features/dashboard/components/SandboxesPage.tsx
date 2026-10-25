import { useEffect, useState } from "react";
import type { SandboxInfo, SetupStatus } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { Toast } from "../../../common/components/Toast";
import { SandboxList } from "./SandboxList";
import { SandboxInspector } from "./SandboxInspector";
import type { SandboxAction } from "../sandboxActions";
import { stateKind } from "../../../common/lib/sandboxState";
import { useSandboxDashboard } from "../hooks/useSandboxDashboard";
import ConnectDialog from "../../connect/components/ConnectDialog";
import CreatePage from "../../create/components/CreatePage";

export interface SandboxesPageProps {
  status: SetupStatus | null;
  /** A sandbox to select and inspect once the list reports it (launch handoff). */
  pendingSelection?: string | null;
  onPendingSelectionHandled?: () => void;
  onGoSettings: () => void;
  onCreate: () => void;
  onCheckSetup: () => Promise<SetupStatus | null>;
  onCount: (count: number) => void;
  /** The create wizard is shown in place of the sandbox list. */
  createOpen: boolean;
  onBack: () => void;
}

const actionLabels: Record<SandboxAction, string> = {
  start: "Starting…",
  stop: "Stopping…",
  restart: "Restarting…",
  terminal: "Opening terminal…",
};

export default function SandboxesPage({
  status,
  pendingSelection,
  onPendingSelectionHandled,
  onGoSettings,
  onCreate,
  onCheckSetup,
  onCount,
  createOpen,
  onBack,
}: SandboxesPageProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<SandboxInfo | null>(null);
  const [search, setSearch] = useState("");
  const installed = !!status?.sbx_installed;
  const {
    sandboxes,
    error,
    refreshing,
    pending,
    notice,
    dismissNotice,
    refresh,
    runAction,
    isActionInFlight,
  } = useSandboxDashboard({ installed, onCount });

  useEffect(() => {
    // Keep the selection on a sandbox that still exists after a refresh, but
    // only while no explicit user choice (or a deliberate deselect) is in
    // force; polling must not reopen the inspector after "Close".
    setSelected((current) =>
      (sandboxes ?? []).some((item) => item.name === current)
        ? current
        : (sandboxes?.[0]?.name ?? null),
    );
  }, [sandboxes !== null]);

  // A launch handed off from another page selects the new sandbox as soon as
  // the list confirms it exists — never assume state the CLI has not reported.
  useEffect(() => {
    if (!pendingSelection) return;
    if ((sandboxes ?? []).some((item) => item.name === pendingSelection)) {
      setSelected(pendingSelection);
      onPendingSelectionHandled?.();
    }
  }, [pendingSelection, sandboxes, onPendingSelectionHandled]);

  const selectSandbox = (name: string | null) => {
    setSelected(name);
  };

  const openConnection = (sandbox: SandboxInfo) => {
    if (isActionInFlight(sandbox.name)) return;
    selectSandbox(sandbox.name);
    setConnecting(sandbox);
  };

  const runPrimaryAction = (sandbox: SandboxInfo) => {
    if (stateKind(sandbox.state) === "running") {
      openConnection(sandbox);
    } else {
      void runAction(sandbox.name, "start").catch(() => {});
    }
  };

  const all = sandboxes ?? [];
  const visible = all.filter((sandbox) =>
    `${sandbox.name} ${sandbox.agent} ${sandbox.workspace}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const detail = all.find((sandbox) => sandbox.name === selected) ?? null;
  const detailPending = detail ? pending.get(detail.name) : undefined;
  const detailRunning = detail !== null && stateKind(detail.state) === "running";
  const needsSetup =
    status !== null &&
    [status.sbx_installed, status.signed_in].some((value) => value === false);

  const running = all.filter((sandbox) => stateKind(sandbox.state) === "running").length;
  const stopped = all.filter((sandbox) => stateKind(sandbox.state) === "stopped").length;
  const inactive = all.length - running - stopped;
  const subtitle = !installed
    ? "Install the CLI to see your sandboxes"
    : error && sandboxes === null
      ? "Unable to load sandboxes"
      : sandboxes === null
        ? "Reading local sandboxes…"
        : `${running} running · ${stopped} stopped${inactive ? ` · ${inactive} inactive` : ""} · on this computer`;

  return (
    <div>
      {createOpen ? (
        <CreateHost onBack={onBack} />
      ) : (
        <>
          <div className="pagehead">
            <div>
              <h1>Your sandboxes</h1>
              <p role="status">{subtitle}</p>
            </div>
            <button className="btn primary" onClick={onCreate}>
              <Icon name="create" size={16} />
              <span>Create sandbox</span>
            </button>
          </div>
          {needsSetup && (
            <div className="banner">
              <strong>Finish setting up Sandy to create sandboxes.</strong>
              <p>Your existing sandboxes are still listed below.</p>
              <button className="btn small" onClick={onGoSettings}>
                Finish setup
              </button>
            </div>
          )}
          <div className={`board ${detail ? "" : "no-detail"}`}>
            <div>
              <SandboxList
                sandboxes={sandboxes}
                visible={visible}
                error={error}
                refreshing={refreshing}
                installed={installed}
                selected={selected}
                pending={pending}
                search={search}
                onSearch={setSearch}
                onRefresh={() => void refresh()}
                onSelect={selectSandbox}
                onOpen={runPrimaryAction}
                onCreate={onCreate}
              />
              <p className="contextline">
                <Icon name="shield" size={15} />
                Each sandbox has its own microVM and Docker daemon.
              </p>
            </div>
            {detail && (
              <SandboxInspector
                detail={detail}
                pending={detailPending}
                running={detailRunning}
                installed={installed}
                onAction={(action) => void runAction(detail.name, action).catch(() => {})}
                onOpen={() => runPrimaryAction(detail)}
                onClose={() => selectSandbox(null)}
                actionLabels={actionLabels}
              />
            )}
          </div>
        </>
      )}
      <div className="toasts" aria-live="polite" aria-atomic="true">
        {notice && <Toast notice={notice} onDismiss={dismissNotice} />}
      </div>
      {connecting && (
        <ConnectDialog
          key={connecting.name}
          sandbox={all.find((sandbox) => sandbox.name === connecting.name) ?? connecting}
          status={status}
          onCheckSetup={onCheckSetup}
          onOpenTerminal={() => runAction(connecting.name, "terminal")}
          onClose={() => setConnecting(null)}
        />
      )}
    </div>
  );
}

/**
 * The in-place create wizard replaces the sandbox list as page content, so
 * "Create sandbox" needs no separate navigation entry and Back restores the
 * list with its previous selection intact.
 */
function CreateHost({ onBack }: { onBack: () => void }) {
  return (
    <div className="createhost">
      <button type="button" className="textbtn" onClick={onBack}>
        <Icon name="back" size={15} /> Back to sandboxes
      </button>
      <CreatePage onClose={onBack} />
    </div>
  );
}
