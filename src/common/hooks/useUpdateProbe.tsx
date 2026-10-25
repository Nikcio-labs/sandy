import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { check } from "@tauri-apps/plugin-updater";

type UpdateProbe = { version: string };

const UpdateContext = createContext<UpdateProbe | null>(null);

/**
 * A quiet background update probe for the rail's version badge. The Settings
 * card runs the interactive download flow with its own updater state; this
 * probe only records that a newer version exists so the rail can show its
 * update marker. Failures are silent: the badge is informational and the
 * Settings check remains the recoverable path.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [probe, setProbe] = useState<UpdateProbe | null>(null);

  useEffect(() => {
    let active = true;
    check({ timeout: 30_000 })
      .then((update) => {
        if (active && update) setProbe({ version: update.version });
      })
      .catch(() => {
        // No update marker on a failed probe; Settings reports check errors.
      });
    return () => {
      active = false;
    };
  }, []);

  return <UpdateContext.Provider value={probe}>{children}</UpdateContext.Provider>;
}

export const useUpdateProbe = () => useContext(UpdateContext);
