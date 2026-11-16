import type { DownloadItem } from "../stores/downloadStore";
import { isDownloadActive } from "../stores/downloadStore";
import type { DispatchTask } from "../types";
import { isWorking } from "./dispatchTask";

/**
 * Why quitting now would interrupt work the user should decide on. An empty list means nothing is
 * running and the app can exit at once. A Dispatch conversation whose turn runs is named once, whatever
 * the number of conversations, since only one turn runs at a time.
 */
export function exitBlockers(
  downloads: readonly DownloadItem[],
  dispatchTasks: readonly DispatchTask[] = [],
): string[] {
  const reasons: string[] = [];
  const activeDownloads = downloads.filter((download) => isDownloadActive(download.status)).length;
  if (activeDownloads > 0) reasons.push(downloadReason(activeDownloads));
  if (dispatchTasks.some((task) => isWorking(task.status))) reasons.push(DISPATCH_REASON);
  return reasons;
}

const DISPATCH_REASON = "A Dispatch conversation is still working. Exit and stop it?";

function downloadReason(count: number): string {
  return `${count} model download${count === 1 ? "" : "s"} in progress`;
}
