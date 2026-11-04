import { useRuntimeUpdateNotices } from "./useRuntimeUpdateNotices";
import { useRuntimeUpdatePolling } from "./useRuntimeUpdatePolling";

/**
 * Runtime update side effects with no UI: the periodic update check and the desktop notice for new
 * updates. Mounted by the main layout, so the checks keep running while the user is on any page.
 */
export function RuntimeUpdateRuntime() {
  useRuntimeUpdatePolling();
  useRuntimeUpdateNotices();
  return null;
}
