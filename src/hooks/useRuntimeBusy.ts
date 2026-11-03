import { isRuntimeInstallActive, useDownloadStore } from "../stores/downloadStore";
import { useRuntimeStore } from "../stores/runtimeStore";

export interface RuntimeBusy {
  /** The install or update is queued or running in the Downloads drawer. */
  installing: boolean;
  /** The uninstall is running from the runtime's card. */
  removing: boolean;
}

/** What a runtime's card waits on: a drawer install or update, or an uninstall run from the card. */
export function useRuntimeBusy(runtimeId: string): RuntimeBusy {
  const installing = useDownloadStore((s) => isRuntimeInstallActive(s.downloads, runtimeId));
  const removing = useRuntimeStore((s) => s.removingIds.includes(runtimeId));
  return { installing, removing };
}
