import { useEffect } from "react";
import { useRuntimeStore } from "../../../stores/runtimeStore";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../../../types";

export interface RuntimeCatalog {
  /** Null until the list has loaded. */
  runtimes: RuntimeInfo[] | null;
  /** Update status by runtime id. A runtime whose check failed has no entry. */
  updatesById: Record<string, RuntimeUpdateInfo>;
  loadError: string | null;
}

/**
 * The runtime list and each runtime's latest release, both from the shared runtime store, so an install
 * finished in the Downloads drawer shows here. The list is re-read when the section opens. The update
 * checks call GitHub, so they run when the section opens and whenever the list changes.
 */
export function useRuntimeCatalog(): RuntimeCatalog {
  const runtimeList = useRuntimeStore((s) => s.runtimes);
  const readError = useRuntimeStore((s) => s.readError);
  const updatesById = useRuntimeStore((s) => s.updatesById);

  useEffect(() => {
    void useRuntimeStore.getState().refresh();
  }, []);

  useEffect(() => {
    if (runtimeList) void useRuntimeStore.getState().checkUpdates();
  }, [runtimeList]);

  return {
    runtimes: runtimeList,
    updatesById,
    loadError: runtimeList ? null : readError,
  };
}
