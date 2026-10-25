import { useCallback, useEffect, useState } from "react";
import type { SetupStatus } from "../../lib/sandbox";
import { checkSetup } from "../../lib/sandbox";

export interface SetupStatusState {
  status: SetupStatus | null;
  statusError: string | null;
  /** True until the first setup check resolves. */
  loading: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /**
   * Run the setup check (a full `sbx` diagnostics batch). Only call this
   * where the answer can change: after a setup action, or on an explicit
   * user request. The sandbox list polls `sbx ls` on its own.
   */
  checkSetup: () => Promise<SetupStatus | null>;
}

/**
 * The setup-status state machine: one setup check at startup decides whether
 * the main window can reveal (incomplete setup hands the screen to the
 * dedicated setup window), and later checks run only when setup-relevant
 * actions run — the connect dialog's SSH check, the Settings "check again"
 * buttons. Nothing polls: setup state only changes through setup actions,
 * and the sandbox list has its own `sbx ls` refresh.
 */
export function useSetupStatus(): SetupStatusState {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const checkSetupNow = useCallback(async () => {
    try {
      const next = await checkSetup();
      // A temporarily unavailable check must not erase a previously verified result.
      setStatus((previous) =>
        previous && next.sbx_installed
          ? {
              ...next,
              signed_in: next.signed_in ?? previous.signed_in,
              image_paste_on: next.image_paste_on ?? previous.image_paste_on,
              ssh_set_up: next.ssh_set_up ?? previous.ssh_set_up,
            }
          : next,
      );
      setStatusError(null);
      return next;
    } catch (error) {
      setStatusError(String(error));
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void checkSetupNow().then(() => {
      if (!active) return;
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [checkSetupNow]);

  return {
    status,
    statusError,
    loading,
    busy,
    setBusy,
    checkSetup: checkSetupNow,
  };
}
