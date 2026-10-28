import { useCallback, useEffect, useState } from "react";
import * as runtimes from "../../../services/runtimes";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";

export interface RuntimeCatalog {
  /** Null until the list has loaded. */
  runtimes: RuntimeInfo[] | null;
  /** Update status by runtime id. A runtime whose check failed has no entry. */
  updatesById: Record<string, RuntimeUpdateInfo>;
  loadError: string | null;
  reload: () => Promise<void>;
}

/** Update checks that succeeded, keyed by runtime id. */
function successfulUpdates(
  checks: PromiseSettledResult<RuntimeUpdateInfo>[],
): Record<string, RuntimeUpdateInfo> {
  const entries = checks.flatMap((check): [string, RuntimeUpdateInfo][] =>
    check.status === "fulfilled" ? [[check.value.id, check.value]] : [],
  );
  return Object.fromEntries(entries);
}

/**
 * The runtime list and each runtime's latest release. Loads once when the component mounts (the
 * Runtimes section opens); `reload` re-reads both after an install or uninstall.
 */
export function useRuntimeCatalog(): RuntimeCatalog {
  const [runtimeList, setRuntimeList] = useState<RuntimeInfo[] | null>(null);
  const [updatesById, setUpdatesById] = useState<Record<string, RuntimeUpdateInfo>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await runtimes.listRuntimes();
      setRuntimeList(list);
      setLoadError(null);
      const checks = await Promise.allSettled(
        list.map((runtime) => runtimes.checkRuntimeUpdate(runtime.id)),
      );
      setUpdatesById(successfulUpdates(checks));
    } catch (err) {
      setLoadError(errorMessage(err, "Could not read the runtimes."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { runtimes: runtimeList, updatesById, loadError, reload };
}
