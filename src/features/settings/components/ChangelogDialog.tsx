import { useEffect, useId, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import Icon from "../../../common/components/Icon";
import "./ChangelogDialog.css";

/**
 * The update offer's "See changes" dialog: renders the release notes as
 * markdown. The notes come from the signed update manifest (the GitHub
 * release body), which may legally contain raw HTML, so the rendered markup
 * is sanitized before it goes into the dialog inline.
 */
export function ChangelogDialog({
  version,
  notes,
  onClose,
}: {
  version: string;
  notes: string;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, []);

  const html = useMemo(() => DOMPurify.sanitize(marked.parse(notes, { async: false })), [notes]);

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-changelog-title`}
      onClose={onClose}
    >
      <div className="sectionhead">
        <h2 id={`${id}-changelog-title`}>Changes in Sandy {version}</h2>
        <button type="button" className="iconbtn" aria-label="Close changelog" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="changelog-body" dangerouslySetInnerHTML={{ __html: html }} />
    </dialog>
  );
}
