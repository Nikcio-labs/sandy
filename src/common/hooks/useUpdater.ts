import { useCallback, useEffect, useRef, useState } from "react";
import { runUpdateCheck, type UpdateError, type UpdateState } from "../../lib/updater";

export interface UpdaterHook {
  state: UpdateState;
  error: UpdateError | null;
  /** True while a check is running, so the check button can disable. */
  busy: boolean;
  check: () => void;
  dismiss: () => void;
}

/**
 * The Settings update flow. State is kept in a ref so progress events can be
 * coalesced per animation frame: the download emits many small `Progress`
 * chunks and each one must not trigger a React render on its own.
 */
export function useUpdater(): UpdaterHook {
  const [state, setState] = useState<UpdateState>({ step: "idle" });
  const [error, setError] = useState<UpdateError | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<UpdateState | null>(null);
  const frame = useRef<number | null>(null);

  const flush = useCallback((next: UpdateState) => {
    pending.current = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) setState(pending.current);
    });
  }, []);

  // Dropping the card mid-download must not leave a queued rAF updating
  // state after unmount; the download itself keeps running by design, since
  // there is no cancel API and interrupting an install would leave a
  // half-applied update.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const check = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void runUpdateCheck(flush, (failure) => {
      setError(failure);
      flush({ step: "idle" });
    }).finally(() => {
      setBusy(false);
    });
  }, [busy, flush]);

  const dismiss = useCallback(() => {
    if (busy) return;
    setState({ step: "idle" });
    setError(null);
  }, [busy]);

  return { state, error, busy, check, dismiss };
}
