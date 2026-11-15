import { useEffect } from "react";
import { notifyIfHidden } from "../../../services/trayStatus";
import { type DownloadItem, useDownloadStore } from "../../../stores/downloadStore";
import { downloadFinishedNotice } from "../../../utils/downloadActivity";
import { downloadsFinished } from "../../../utils/trayStatus";

function notifyDownloadFinished(download: DownloadItem): void {
  const { title, body } = downloadFinishedNotice(download);
  void notifyIfHidden(title, body);
}

/**
 * Shows a notification when a download finishes while the window is hidden. The list at mount is the
 * starting point, so downloads that were already finished are not reported again.
 */
export function useFinishedDownloadNotices(): void {
  useEffect(() => {
    let previousDownloads = useDownloadStore.getState().downloads;
    return useDownloadStore.subscribe((state) => {
      const finished = downloadsFinished(previousDownloads, state.downloads);
      previousDownloads = state.downloads;
      for (const download of finished) notifyDownloadFinished(download);
    });
  }, []);
}
