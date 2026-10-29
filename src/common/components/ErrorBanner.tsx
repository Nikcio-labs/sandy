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
  role = "alert",
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  /** Status banners announce politely; alerts (the default) interrupt. */
  role?: "alert" | "status";
}) {
  return (
    <div className="banner error" role={role}>
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
