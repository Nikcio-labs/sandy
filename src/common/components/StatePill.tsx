import { stateKind } from "../lib/sandboxState";
import "./StatePill.css";

export function StatePill({ state, pending }: { state: string; pending?: boolean | string }) {
  const label = state.replace(/^[•○]\s*/, "").trim() || "Unknown";
  // Pending actions are Sandy's own work, never a CLI state: they borrow the
  // violet pending styling while the CLI-reported label stays untouched.
  return (
    <span className={`state ${pending ? "pending" : stateKind(state)}`}>
      {pending ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        <span className="dot" aria-hidden="true" />
      )}
      {pending
        ? typeof pending === "string"
          ? pending
          : "Working…"
        : label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}
