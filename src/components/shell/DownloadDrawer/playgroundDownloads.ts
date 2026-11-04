import {
  downloadImageModel,
  downloadOcrModel,
  downloadSpeechModel,
  downloadUpscaleModel,
} from "../../../services/playground";
import {
  isPlaygroundDownloadActive,
  type PlaygroundDownload,
  useDownloadStore,
} from "../../../stores/downloadStore";
import type { PlaygroundModelKind } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { playgroundSourceOf } from "../../../utils/playground";

/**
 * The backend download each Playground kind runs. The model rows and the drawer's Retry both start a
 * download through here, so each kind has one entry point.
 */
const RUNNERS: Record<PlaygroundModelKind, (modelId: string) => Promise<void>> = {
  image: downloadImageModel,
  upscale: downloadUpscaleModel,
  speech: downloadSpeechModel,
  ocr: downloadOcrModel,
};

export interface PlaygroundDownloadRequest {
  kind: PlaygroundModelKind;
  modelId: string;
  name: string;
}

/**
 * Start a Playground model download. The drawer item shows it at once, and the model rows read it from
 * there; the backend's `playground-download-*` events then update the item. The backend request resolves
 * when the run ends, so a rejection here is a failure the events did not report (for example an unknown
 * model), and it is recorded on the drawer item. A download already running is not started again.
 */
export function beginPlaygroundDownload(request: PlaygroundDownloadRequest): void {
  const { kind, modelId, name } = request;
  if (isPlaygroundDownloadActive(useDownloadStore.getState().downloads, modelId)) return;

  useDownloadStore.getState().startPlayground({
    kind,
    modelId,
    name,
    source: playgroundSourceOf(kind),
  });

  RUNNERS[kind](modelId).catch((err: unknown) => {
    useDownloadStore.getState().failPlayground(modelId, errorMessage(err, "The download failed."));
  });
}

/** Retry a failed or cancelled Playground download from the drawer, with the same kind and model. */
export function retryPlaygroundDownload(download: PlaygroundDownload): void {
  beginPlaygroundDownload({
    kind: download.kind,
    modelId: download.modelId,
    name: download.name,
  });
}
