import type { ReactNode } from "react";
import "./PageHead.css";

/**
 * The page title block: heading, optional subtitle, and an optional action
 * on the right. Every routed page starts with one.
 */
export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p role="status">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** A quiet icon-and-caption line closing a page's content. */
export function ContextLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="contextline">
      {icon}
      {children}
    </p>
  );
}
