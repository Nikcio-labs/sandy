import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/**
 * The current Sandy version for informational badges. The version is static
 * per install, so a failed read just stays hidden rather than retrying.
 */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getVersion()
      .then((current) => {
        if (active) setVersion(current);
      })
      .catch(() => {
        // A failed read keeps the version hidden; there is no useful retry.
      });
    return () => {
      active = false;
    };
  }, []);

  return version;
}
