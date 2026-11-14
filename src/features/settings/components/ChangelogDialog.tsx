import { useEffect, useId, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";
import Icon from "../../../common/components/Icon";
import "./ChangelogDialog.css";

/**
 * The update offer's "See changes" dialog: renders the release notes as
 * markdown. The notes are the GitHub release body copied verbatim into the
 * update manifest — the updater's signature covers the installer bundle, not
 * these notes — so the rendered markup is sanitized before it goes into the
 * dialog inline.
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

  // The notes are link-heavy and this is the app's only rendered HTML: a
  // plain anchor would try to navigate the webview away, so http(s) links
  // are handed to the opener plugin and the system browser instead.
  const onBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href || !/^https?:/i.test(href)) return;
    event.preventDefault();
    void openUrl(href).catch(() => {
      // Without a system browser the link simply does nothing; there is no
      // in-app surface to report it on.
    });
  };

  return (
    <dialog
      ref={dialog}
      className="appdialog"
      aria-labelledby={`${id}-changelog-title`}
      onClose={onClose}
    >
      <div className="sectionhead">
        <h2 id={`${id}-changelog-title`}>Changes in Sandy {version}</h2>
        <button
          type="button"
          className="iconbtn"
          aria-label="Close changelog"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div
        className="changelog-body"
        onClick={onBodyClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </dialog>
  );
}
