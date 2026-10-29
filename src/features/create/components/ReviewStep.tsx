import { useId } from "react";
import type { FormEvent } from "react";
import type { KitOption } from "../../../lib/kit";
import { previewTemplate } from "../../../lib/kit";
import type { SaveTemplateRequest } from "../../../lib/templates";
import Icon from "../../../common/components/Icon";

export function ReviewStep({
  agent,
  mixins,
  selectedKits,
  name,
  onName,
  workspace,
  onWorkspace,
  mountless,
  onMountless,
  savePath,
  onSavePath,
  editing,
  busy,
  request,
  onSubmit,
  onBrowse,
  onBack,
}: {
  agent: KitOption;
  mixins: KitOption[];
  selectedKits: KitOption[];
  name: string;
  onName: (value: string) => void;
  workspace: string;
  onWorkspace: (value: string) => void;
  mountless: boolean;
  onMountless: (value: boolean) => void;
  savePath: string;
  onSavePath: (value: string) => void;
  /** Editing overwrites the saved file in place; no save location is offered. */
  editing: boolean;
  busy: boolean;
  request: SaveTemplateRequest;
  onSubmit: (launch: boolean) => void;
  onBrowse: (target: "workspace" | "path") => void;
  onBack: () => void;
}) {
  const id = useId();
  const ready = !!name.trim() && (mountless || !!workspace.trim());
  return (
    <form
      className="panel catalog-panel"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        onSubmit(submitter?.getAttribute("value") === "launch");
      }}
    >
      <h2>Name your sandbox</h2>
      <p className="help intro">
        {editing
          ? "Saving updates this template where it is saved today."
          : "This setup is saved as a template, so next time is one click."}
      </p>
      <fieldset className="catalog-unframed" disabled={busy}>
        <legend className="sr-only">Project details</legend>
        <label className="field" htmlFor={`${id}-name`}>
          Name
          <input
            id={`${id}-name`}
            value={name}
            required
            maxLength={128}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
            placeholder="my-project"
            onChange={(event) => onName(event.target.value)}
          />
          <span className="help">Letters, numbers, dots, underscores, and hyphens.</span>
        </label>
        {!mountless && (
          <>
            <div className="field">
              <span id={`${id}-workspace-label`}>Project folder</span>
              <div className="path-row">
                <input
                  id={`${id}-workspace`}
                  value={workspace}
                  required
                  placeholder="Pick a folder on this computer"
                  aria-labelledby={`${id}-workspace-label`}
                  aria-describedby={`${id}-workspace-help`}
                  onChange={(event) => onWorkspace(event.target.value)}
                />
                <button type="button" className="btn" onClick={() => onBrowse("workspace")}>
                  Browse
                </button>
              </div>
              <p className="help" id={`${id}-workspace-help`}>
                The sandbox edits files in this folder. Skip it with “Work without a folder” below.
              </p>
            </div>
          </>
        )}
        <label className="check" htmlFor={`${id}-mountless`}>
          <input
            id={`${id}-mountless`}
            type="checkbox"
            checked={mountless}
            onChange={(event) => onMountless(event.target.checked)}
          />
          Work without a folder
        </label>
        <p className="help" id={`${id}-mountless-help`}>
          The sandbox is fully isolated from this computer. Its files disappear with it.
        </p>
        {!editing && (
          <details className="catalog-advanced">
            <summary>Where the template is saved</summary>
            <div className="field">
              <span id={`${id}-path-label`}>File</span>
              <div className="path-row">
                <input
                  id={`${id}-path`}
                  value={savePath}
                  placeholder="Sandy manages this for you"
                  aria-labelledby={`${id}-path-label`}
                  aria-describedby={`${id}-path-help`}
                  onChange={(event) => onSavePath(event.target.value)}
                />
                <button type="button" className="btn" onClick={() => onBrowse("path")}>
                  Choose file
                </button>
              </div>
              <p className="help" id={`${id}-path-help`}>
                Leave blank to keep templates with Sandy, outside your project.
              </p>
            </div>
          </details>
        )}
        <details className="catalog-advanced">
          <summary>Review the setup file</summary>
          <dl className="details catalog-review-grid">
            <dt>Agent</dt>
            <dd>{agent.name}</dd>
            <dt>Add-ons</dt>
            <dd>{mixins.length ? mixins.map((kit) => kit.name).join(", ") : "None"}</dd>
            <dt>Folder</dt>
            <dd>
              {mountless ? "None — isolated from this computer" : workspace.trim() || "Not set"}
            </dd>
          </dl>
          <ul className="catalog-reference-list">
            {selectedKits.map((kit) => (
              <li key={kit.id}>
                <strong>{kit.name}</strong>
                <code>{kit.source}</code>
              </li>
            ))}
          </ul>
          <pre className="catalog-yaml" aria-label="Environment YAML preview">
            <code>{previewTemplate(request)}</code>
          </pre>
        </details>
        <div className="actionbar">
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="submit" name="action" value="save" className="btn" disabled={!ready}>
            Save only
          </button>
          <button
            type="submit"
            name="action"
            value="launch"
            className="btn primary"
            disabled={!ready}
          >
            {busy ? (
              <>
                <span className="spinner" /> {editing ? "Updating…" : "Launching…"}
              </>
            ) : (
              <>
                {editing ? "Update & launch" : "Launch sandbox"} <Icon name="arrow" size={16} />
              </>
            )}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
