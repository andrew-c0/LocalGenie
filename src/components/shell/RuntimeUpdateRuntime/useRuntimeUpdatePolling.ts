import { useEffect } from "react";
import { useRuntimeStore } from "../../../stores/runtimeStore";
import { RUNTIME_UPDATE_CHECK_INTERVAL_MS } from "../../../utils/runtimeUpdateNotice";

/** Re-checks every runtime's latest release on a timer while the app is open. Silent, like the start check. */
export function useRuntimeUpdatePolling(): void {
  useEffect(() => {
    const timer = setInterval(() => {
      void useRuntimeStore.getState().checkUpdates();
    }, RUNTIME_UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}
