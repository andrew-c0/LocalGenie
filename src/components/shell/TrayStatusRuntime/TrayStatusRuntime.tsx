import { useFinishedDownloadNotices } from "./useFinishedDownloadNotices";
import { useTrayTooltipSync } from "./useTrayTooltipSync";

/**
 * Background activity side effects with no UI: the tray tooltip and the notice when a download ends while
 * the window is hidden. Mounted by the main layout, so both keep working on any page.
 */
export function TrayStatusRuntime() {
  useTrayTooltipSync();
  useFinishedDownloadNotices();
  return null;
}
