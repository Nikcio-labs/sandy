import type { SavedTemplate } from "../../../lib/templates";
import Icon from "../../../common/components/Icon";

export function FinishedPanel({
  saved,
  launched,
  launchOutput,
  busy,
  error,
  copyNotice,
  edited,
  onRetryLaunch,
  onCopy,
  onTemplates,
  onClose,
}: {
  saved: SavedTemplate;
  launched: boolean;
  launchOutput: string;
  busy: boolean;
  error: string | null;
  copyNotice: string;
  /** Editing saved over the existing file instead of creating a new one. */
  edited?: boolean;
  onRetryLaunch: () => void;
  onCopy: () => void;
  onTemplates?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="panel catalog-panel catalog-finished">
      <span className={`empty-icon ${launched ? "green" : ""}`}>
        <Icon name={launched ? "check" : "template"} size={30} />
      </span>
      <h2>{launched ? "Sandbox launched" : edited ? "Template updated" : "Template saved"}</h2>
      <p className="help intro">
        {busy
          ? "Launching your sandbox…"
          : launched
            ? `${saved.name} is ready in your sandboxes.`
            : edited
              ? `${saved.name} was saved over its existing file. You can launch it now, or reuse it from Templates later.`
              : "You can launch this template now, or reuse it from Templates later."}
      </p>
      <dl className="catalog-review-grid">
        <dt>Name</dt>
        <dd>{saved.name}</dd>
        <dt>File</dt>
        <dd>
          <code>{saved.path}</code>
        </dd>
        <dt>Agent</dt>
        <dd>{saved.agent}</dd>
        <dt>Kit format</dt>
        <dd>v{saved.kit_version}</dd>
        <dt>Workspace</dt>
        <dd>{saved.workspace || "None (mountless, isolated)"}</dd>
      </dl>
      <div className="sectionhead">
        <h3>Saved YAML</h3>
        <button type="button" className="btn" disabled={busy} onClick={onCopy}>
          <Icon name="clipboard" size={16} /> Copy YAML
        </button>
      </div>
      <pre className="catalog-yaml" aria-label="Saved template YAML">
        <code>{saved.content}</code>
      </pre>
      {copyNotice && (
        <p className="help" role="status">
          {copyNotice}
        </p>
      )}
      {launchOutput && (
        <details className="catalog-output">
          <summary>Launch output</summary>
          <pre>{launchOutput}</pre>
        </details>
      )}
      <div className="actionbar">
        {!launched && (
          <button type="button" className="btn primary" disabled={busy} onClick={onRetryLaunch}>
            {busy ? (
              <>
                <span className="spinner" /> Launching…
              </>
            ) : error ? (
              "Retry launch"
            ) : (
              "Launch sandbox"
            )}
          </button>
        )}
        {onTemplates && (
          <button
            type="button"
            className={launched ? "btn primary" : "btn"}
            disabled={busy}
            onClick={onTemplates}
          >
            View saved templates
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
