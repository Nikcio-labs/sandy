import { useEffect, useId, useRef } from "react";
import CreatePage from "./CreatePage";
import Icon from "../../../common/components/Icon";
import "./CreateDialog.css";

export interface CreateDialogProps {
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** Called with the sandbox name after the wizard launches one. */
  onLaunched?: (sandbox: string) => void;
  /** Present when the wizard edits an existing template instead of creating one. */
  templateId?: string;
}

/**
 * The create wizard in a wide modal dialog, over the page the user came
 * from. The wizard body is the same CreatePage the flow used as a
 * standalone page.
 */
export default function CreateDialog({ onClose, onBusyChange, onLaunched, templateId }: CreateDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(false);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const close = () => {
    // Close fires once per dialog; guard against the close event plus an
    // explicit close both invoking onClose.
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog appdialog-wide"
      aria-labelledby={`${id}-create-title`}
      onCancel={(event) => {
        // The wizard's own discard flow decides whether closing is allowed.
        event.preventDefault();
        dialog.current
          ?.querySelector<HTMLButtonElement>("[data-wizard-cancel]")
          ?.click();
      }}
      onClose={close}
      onClick={(event) => {
        // A click on the backdrop (the dialog padding box outside the
        // content) dismisses.
        if (event.target === dialog.current) close();
      }}
    >
      <span id={`${id}-create-title`} className="sr-only">
        {templateId ? "Edit template" : "Create a sandbox"}
      </span>
      <div className="appdialog-wide-body">
        <button
          type="button"
          className="iconbtn dialogclose"
          aria-label="Close create dialog"
          title="Close create dialog"
          onClick={close}
        >
          <Icon name="close" size={16} />
        </button>
        <CreatePage
          templateId={templateId}
          onClose={close}
          onLaunched={onLaunched}
          onBusyChange={onBusyChange}
          inDialog
        />
      </div>
    </dialog>
  );
}
