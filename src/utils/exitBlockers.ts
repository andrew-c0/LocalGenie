import type { DownloadItem } from "../stores/downloadStore";
import { isDownloadActive } from "../stores/downloadStore";

/**
 * Why quitting now would interrupt work the user should decide on. An empty list means nothing is
 * running and the app can exit at once. A running Dispatch task adds its reason here later.
 */
export function exitBlockers(downloads: readonly DownloadItem[]): string[] {
  const reasons: string[] = [];
  const activeDownloads = downloads.filter((download) => isDownloadActive(download.status)).length;
  if (activeDownloads > 0) reasons.push(downloadReason(activeDownloads));
  return reasons;
}

function downloadReason(count: number): string {
  return `${count} model download${count === 1 ? "" : "s"} in progress`;
}
