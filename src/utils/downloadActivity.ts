import { type DownloadItem, isDownloadActive, progressFractionOf } from "../stores/downloadStore";
import type { TrayActivity } from "./trayStatus";

/** The verb phrase's first words for an active entry. A runtime is installed, not downloaded. */
function actionOf(download: DownloadItem): string {
  if (download.runtime) {
    return download.status === "queued" ? "Waiting to install" : "Installing";
  }
  switch (download.status) {
    case "importing":
      return "Importing";
    case "downloading":
      return "Downloading";
    default:
      return "Waiting to download";
  }
}

/** The whole percent of a download that is transferring bytes. Undefined when it is not known or not transferring. */
function transferPercentOf(download: DownloadItem): number | undefined {
  if (download.status !== "downloading") return undefined;
  const fraction = progressFractionOf(download);
  return fraction === null ? undefined : Math.round(fraction * 100);
}

/**
 * The tray activity of a download entry, or null when it is not active. The label is the entry's own
 * name, as the drawer shows it. Only a transfer has a percent; queued and importing downloads have none.
 */
export function downloadActivityOf(download: DownloadItem): TrayActivity | null {
  if (!isDownloadActive(download.status)) return null;
  return {
    id: download.id,
    label: `${actionOf(download)} ${download.label}`,
    percent: transferPercentOf(download),
  };
}

/** The desktop notice for a download that finished: a runtime install says it was installed. */
export function downloadFinishedNotice(download: DownloadItem): { title: string; body: string } {
  const body = download.runtime
    ? `${download.label} was installed.`
    : `${download.label} finished downloading.`;
  return { title: "Download complete", body };
}
