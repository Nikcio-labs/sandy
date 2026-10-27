import type { ReactNode } from "react";

/**
 * The repeating error banner: a bold heading, body content, and an optional
 * retry action, styled by the shared `.banner.error` component class.
 */
export function ErrorBanner({
  title,
  children,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="banner error" role="alert">
      <strong>{title}</strong>
      {children}
      {actionLabel && onAction && (
        <button className="btn small" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
