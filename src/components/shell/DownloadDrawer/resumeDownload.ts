import { type DownloadItem, useDownloadStore } from "../../../stores/downloadStore";
import type { RetryTrigger } from "../../../utils/downloadAutoRetry";
import { retryPlaygroundDownload } from "./playgroundDownloads";

/**
 * Run a failed or cancelled download again. The drawer's Resume button and the automatic retry both call
 * this, so both take the same path; `trigger` tells the store which retry budget applies. A Playground
 * download starts again directly, since it is never queued. Every other kind goes back into the queue,
 * where the pipeline continues from its partial file.
 */
export function resumeDownload(entry: DownloadItem, trigger: RetryTrigger = "manual"): void {
  if (entry.playground) retryPlaygroundDownload(entry.playground, trigger);
  else useDownloadStore.getState().requeue(entry.id, trigger);
}
