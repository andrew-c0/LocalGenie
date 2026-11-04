import {
  isDownloadActive,
  playgroundDownloadId,
  playgroundDownloadViewOf,
  useDownloadStore,
} from "../stores/downloadStore";
import type { PlaygroundDownloadView } from "../types";

/**
 * A model's Playground download as its row shows it, read from the download store (the drawer entry).
 * Null when the model has no running, failed or cancelled download.
 */
export function usePlaygroundDownload(modelId: string): PlaygroundDownloadView | null {
  const item = useDownloadStore((s) =>
    s.downloads.find((d) => d.id === playgroundDownloadId(modelId)),
  );
  return playgroundDownloadViewOf(item);
}

/** True while any Playground model download is queued or running. Downloads run one at a time. */
export function usePlaygroundDownloadBusy(): boolean {
  return useDownloadStore((s) =>
    s.downloads.some((d) => d.playground !== undefined && isDownloadActive(d.status)),
  );
}
