import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

/**
 * The full-window pane: a back-navigated detail card that replaces a
 * page's list (Settings sections, template details). Fills the main area
 * inside its padding; the header stays pinned while the content scrolls.
 * The host page adds `pane-open` to its root and renders the pane instead
 * of the list (see .pane-open in src/styles/panels.css). The heading is
 * focused on open so keyboard users land inside the new surface.
 */
export function Pane({
  label,
  actions,
  onBack,
  children,
}: {
  /** Pane title; also names the back button ("Back to {label}"). */
  label: string;
  /** Buttons pinned in the header after the title. */
  actions?: ReactNode;
  onBack: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="panel pane" aria-label={label}>
      <header className="panehead">
        <button type="button" className="iconbtn" aria-label={`Back to ${label}`} onClick={onBack}>
          <Icon name="back" size={18} />
        </button>
        <h2 tabIndex={-1} ref={heading}>
          {label}
        </h2>
        {actions}
      </header>
      <div className="panecontent">{children}</div>
    </section>
  );
}
