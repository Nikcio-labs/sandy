import { useEffect, useId, useRef, useState } from "react";
import type { SandboxInfo } from "../../../lib/sandbox";
import { removeSandbox } from "../../../lib/sandbox";
import Icon from "../../../common/components/Icon";
import { ErrorBanner } from "../../../common/components/ErrorBanner";
import { useMountedRef } from "../../../common/hooks/useMountedRef";

/** Asks for confirmation, then deletes the sandbox via `sbx rm`. */
export function RemoveSandboxDialog({
  sandbox,
  onRemoved,
  onClose,
}: {
  sandbox: SandboxInfo;
  onRemoved: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useMountedRef();
  const actionLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, []);

  const close = () => {
    if (actionLock.current) return;
    dialog.current?.close();
  };

  const remove = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setRemoveError(null);
    try {
      await removeSandbox(sandbox.name);
      if (!mounted.current) return;
      onRemoved();
      dialog.current?.close();
    } catch (failure) {
      if (mounted.current) {
        setRemoveError(String(failure));
        actionLock.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-remove-title`}
      aria-describedby={`${id}-remove-description`}
      onCancel={(event) => {
        if (actionLock.current) event.preventDefault();
      }}
      onClose={() => {
        setRemoveError(null);
        onClose();
      }}
    >
      <div aria-busy={busy}>
        <div className="sectionhead">
          <h2 id={`${id}-remove-title`}>Remove {sandbox.name}?</h2>
          <button
            type="button"
            className="iconbtn"
            aria-label="Close remove dialog"
            disabled={busy}
            onClick={close}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="help intro" id={`${id}-remove-description`}>
          This permanently deletes the sandbox {sandbox.name} and the files inside it. A workspace
          folder shared from your computer keeps its files.
        </p>
        {removeError && (
          <ErrorBanner title="Couldn’t remove this sandbox.">
            <p>{removeError}</p>
            <span>Try removing it again.</span>
          </ErrorBanner>
        )}
        <div className="actionbar end">
          <button type="button" className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={remove} disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Removing…
              </>
            ) : removeError ? (
              "Retry remove"
            ) : (
              <>
                <Icon name="trash" size={16} /> Remove sandbox
              </>
            )}
          </button>
        </div>
        {busy && (
          <p className="statusline" role="status">
            Removing the sandbox…
          </p>
        )}
      </div>
    </dialog>
  );
}
