import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { SavedTemplate } from "../../../lib/templates";
import { launchTemplate } from "../../../lib/templates";
import { launchPhaseLabel, listSandboxes } from "../../../lib/sandbox";
import type { LaunchProgress } from "../../../lib/sandbox";
import { pickWorkspace } from "../../../lib/catalog";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { useMountedRef } from "../../../common/hooks/useMountedRef";
import "./LaunchDialog.css";

export function LaunchDialog({
  template,
  onLaunched,
  onClose,
}: {
  template: SavedTemplate;
  onLaunched: (notice: string, sandbox: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useMountedRef();
  const actionLock = useRef(false);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(template.name);
  const [workspace, setWorkspace] = useState(template.workspace);
  const [mountless, setMountless] = useState(!template.workspace);
  const [busy, setBusy] = useState<"launch" | "workspace" | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [phase, setPhase] = useState<LaunchProgress | null>(null);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  // A sandbox with this name already exists: launching resumes it instead of
  // applying the template, so the workspace choices are locked.
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, []);

  useEffect(() => {
    consoleEnd.current?.scrollIntoView({ block: "end" });
  }, [consoleLines]);

  useEffect(() => {
    const candidate = name.trim();
    if (!candidate) {
      setExisting(false);
      return;
    }
    let active = true;
    listSandboxes()
      .then((sandboxes) => {
        if (active) setExisting(sandboxes.some((sandbox) => sandbox.name === candidate));
      })
      .catch(() => {
        // Without the list the resume state is unknown; launch reports it.
      });
    return () => {
      active = false;
    };
  }, [name]);

  const resume = existing;

  const close = () => {
    if (actionLock.current) return;
    dialog.current?.close();
  };

  const browse = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy("workspace");
    setLaunchError(null);
    try {
      const path = await pickWorkspace();
      if (path && mounted.current) setWorkspace(path);
    } catch (failure) {
      if (mounted.current) setLaunchError(String(failure));
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const launch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionLock.current) return;
    if (!name.trim() || (!mountless && !workspace.trim())) {
      setLaunchError("Enter a sandbox name and a workspace folder.");
      return;
    }
    actionLock.current = true;
    setBusy("launch");
    setLaunchError(null);
    setPhase({ kind: "preparing" });
    setConsoleLines([]);
    try {
      await launchTemplate(
        {
          id: template.id,
          name: name.trim(),
          workspace: mountless ? "" : workspace.trim(),
        },
        (progress) => {
          if (!mounted.current) return;
          if (progress.kind === "output") {
            setConsoleLines((lines) => [...lines, progress.text]);
          } else {
            setPhase(progress);
          }
        },
      );
      if (!mounted.current) return;
      onLaunched(`${name.trim()} launched from ${template.name}.`, name.trim());
      // The sandbox exists: the dialog's job is done and the dashboard takes
      // over. Close without waiting for the user to dismiss it.
      dialog.current?.close();
    } catch (failure) {
      if (mounted.current) setLaunchError(String(failure));
    } finally {
      actionLock.current = false;
      if (mounted.current) {
        setBusy(null);
        setPhase(null);
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-launch-title`}
      aria-describedby={`${id}-launch-description`}
      onCancel={(event) => {
        if (actionLock.current) event.preventDefault();
      }}
      onClose={() => {
        setLaunchError(null);
        returnFocus.current?.focus();
        onClose();
      }}
    >
      <form onSubmit={launch} aria-busy={busy !== null}>
        <div className="sectionhead">
          <h2 id={`${id}-launch-title`}>Launch {template.name}</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close launch dialog"
            disabled={busy !== null}
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="help intro" id={`${id}-launch-description`}>
          Choose a new name or workspace to reuse this environment. These choices apply to this
          launch.
        </p>
        {launchError && (
          <ErrorBanner title="Couldn’t launch this sandbox.">
            <p>{launchError}</p>
            <span>Edit the details or try launching again.</span>
          </ErrorBanner>
        )}
        {resume && (
          <div className="banner" role="status">
            <strong>Resume {name.trim()}</strong>
            <p>
              This name already exists. Its agent, kits, and workspace are kept; the template is
              not applied again.
            </p>
          </div>
        )}
        <fieldset className="catalog-unframed" disabled={busy !== null}>
          <legend className="sr-only">Sandbox launch details</legend>
          <label className="field" htmlFor={`${id}-launch-name`}>
            Sandbox name
            <input
              id={`${id}-launch-name`}
              autoFocus
              required
              maxLength={128}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
              value={name}
              placeholder="Sandbox name"
              onChange={(event) => setName(event.target.value)}
            />
            <span className="help">
              Use a new name to create a separate sandbox. Start with a letter or number; use
              letters, numbers, dots, underscores, or hyphens.
            </span>
          </label>
          <label className="check" htmlFor={`${id}-launch-mountless`}>
            <input
              id={`${id}-launch-mountless`}
              type="checkbox"
              checked={mountless}
              disabled={resume}
              onChange={(event) => setMountless(event.target.checked)}
            />
            Run without a workspace (mountless)
          </label>
          <p className="help" id={`${id}-launch-mountless-help`}>
            The sandbox gets no folder from this computer, isolating it from the host file system.
          </p>
          {!mountless && (
            <>
              <label className="field" htmlFor={`${id}-launch-workspace`}>
                Workspace folder
              </label>
              <div className="path-row">
                <input
                  id={`${id}-launch-workspace`}
                  required
                  value={workspace}
                  disabled={resume}
                  placeholder="Absolute project path"
                  onChange={(event) => setWorkspace(event.target.value)}
                />
                <button type="button" className="btn" onClick={browse} disabled={resume}>
                  Browse…
                </button>
              </div>
            </>
          )}
          <div className="actionbar end">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={!name.trim() || (!mountless && !workspace.trim())}
            >
              {busy === "launch" ? (
                <>
                  <span className="spinner" /> Launching…
                </>
              ) : launchError ? (
                "Retry launch"
              ) : (
                "Launch sandbox"
              )}
            </button>
          </div>
        </fieldset>
        {busy === "workspace" && (
          <p className="statusline" role="status">
            Choose a workspace in the folder picker…
          </p>
        )}
        {busy === "launch" && phase && (
          <div className="catalog-launch-progress">
            <p className="statusline" role="status">
              <span className="spinner" /> {launchPhaseLabel(phase)}
            </p>
            {consoleLines.length > 0 && (
              <pre className="console" role="log" aria-label="Sandbox creation console output">
                {consoleLines.join("\n")}
                <span ref={consoleEnd} />
              </pre>
            )}
          </div>
        )}
      </form>
    </dialog>
  );
}
