import type { SandboxInfo } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { Avatar } from "../../../common/components/Avatar";
import { StatePill } from "../../../common/components/StatePill";
import { stateLabel } from "../../../common/lib/sandboxState";
import type { SandboxAction } from "../sandboxActions";
import "./SandboxInspector.css";

export function SandboxInspector({
  detail,
  pending,
  running,
  installed,
  onAction,
  onOpen,
  onRemove,
  onClose,
  actionLabels,
}: {
  detail: SandboxInfo;
  pending: SandboxAction | undefined;
  running: boolean;
  installed: boolean;
  onAction: (action: SandboxAction) => void;
  onOpen: () => void;
  onRemove: () => void;
  onClose: () => void;
  actionLabels: Record<SandboxAction, string>;
}) {
  const busy = !!pending;
  return (
    <aside className="panel inspector" aria-label="Sandbox details">
      <div className="inshead">
        <button
          className="iconbtn insclose"
          aria-label="Close sandbox details"
          title="Close sandbox details"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
        <Avatar name={detail.name} />
        <h2>{detail.name}</h2>
        <StatePill state={detail.state} pending={pending && actionLabels[pending]} />
        <p className="help">
          Local sandbox · {detail.agent || "No agent reported"}
        </p>
      </div>
      <div className="insbody" aria-busy={busy}>
        <button
          className="btn primary"
          disabled={busy || !installed}
          onClick={onOpen}
        >
          <Icon name={running ? "terminal" : "create"} size={16} />
          {running ? "Open sandbox" : "Start sandbox"}
        </button>
        <div className="actions">
          <button
            className="btn"
            disabled={busy || !running || !installed}
            onClick={() => onAction("stop")}
          >
            <Icon name="stop" size={14} />
            Stop
          </button>
          <button
            className="btn"
            disabled={busy || !running || !installed}
            onClick={() => onAction("restart")}
          >
            <Icon name="refresh" size={14} />
            Restart
          </button>
          {!running && (
            <button className="btn danger" disabled={busy || !installed} onClick={onRemove}>
              <Icon name="trash" size={14} />
              Remove
            </button>
          )}
        </div>
        {pending && (
          <p className="help" role="status">
            <span className="spinner" aria-hidden="true" /> {actionLabels[pending]}
          </p>
        )}
        <dl className="details inspector-details">
          <dt>Agent</dt>
          <dd>{detail.agent || "Not reported"}</dd>
          <dt>Workspace</dt>
          <dd>
            <code>{detail.workspace || "None (mountless)"}</code>
          </dd>
          <dt>CLI state</dt>
          <dd>{stateLabel(detail.state)}</dd>
        </dl>
      </div>
      <div className="boundary-note">
        <strong>
          {detail.workspace
            ? "This folder is shared with your host"
            : "Files stay in this sandbox"}
        </strong>
        {detail.workspace
          ? "Agent edits change the files on your computer directly."
          : "Stopping keeps internal files. Removing the sandbox deletes them."}
      </div>
    </aside>
  );
}
