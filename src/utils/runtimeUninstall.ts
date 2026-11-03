import { uninstallRuntime } from "../services/runtimes";
import { isRuntimeInstallActive, useDownloadStore } from "../stores/downloadStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { errorMessage } from "./errorMessage";
import { refreshAfterRuntimeChange } from "./runtimeUsage";
import { toast } from "./toast";

/**
 * Uninstalls a runtime from its card. This is not a drawer entry: the runtime is marked busy in
 * `runtimeStore` while it runs, and a toast reports the result. Refused (a no-op) while the runtime's
 * install or update is queued or running, or while it is already being removed.
 */
export async function uninstallRuntimeNow(runtime: {
  id: string;
  displayName: string;
}): Promise<void> {
  const { removingIds, beginRemoving, endRemoving } = useRuntimeStore.getState();
  if (removingIds.includes(runtime.id)) return;
  if (isRuntimeInstallActive(useDownloadStore.getState().downloads, runtime.id)) return;

  beginRemoving(runtime.id);
  try {
    await uninstallRuntime(runtime.id);
    toast.success(`${runtime.displayName} removed`);
  } catch (err) {
    toast.error("Uninstall failed", `${runtime.displayName}: ${errorMessage(err)}`);
  } finally {
    endRemoving(runtime.id);
    // Re-read whether it worked or failed partway: the list, the feature locks and the model library follow it.
    await refreshAfterRuntimeChange(runtime.id);
  }
}
