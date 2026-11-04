import { useEffect, useState } from "react";
import { getAppVersions } from "../services/appInfo";
import { getPlatformInfo } from "../services/system";
import type { AppInfo } from "../types";

/** The app's versions and the host platform, read once when the About page opens. Null until both are read. */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getAppVersions(), getPlatformInfo()])
      .then(([versions, platform]) => {
        if (active) setInfo({ versions, platform });
      })
      .catch((err: unknown) => console.error("[about] Could not read the app info:", err));
    return () => {
      active = false;
    };
  }, []);

  return info;
}
