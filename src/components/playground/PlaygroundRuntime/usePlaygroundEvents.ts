import { useTauriEvent } from "../../../hooks";
import * as playground from "../../../services/playground";
import {
  type DownloadItem,
  downloadSourceName,
  playgroundDownloadId,
  useDownloadStore,
} from "../../../stores/downloadStore";
import { useOcrStore } from "../../../stores/ocrStore";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { useSpeechStore } from "../../../stores/speechStore";
import type {
  ImageOutcome,
  PlaygroundDownloadDone,
  PlaygroundDownloadProgress,
  PlaygroundImageDone,
  PlaygroundImageProgress,
  PlaygroundOcrDone,
  PlaygroundSpeechDone,
  PlaygroundSpeechProgress,
} from "../../../types";
import { willRetryAutomatically } from "../../../utils/downloadAutoRetry";
import { errorMessage } from "../../../utils/errorMessage";
import { formatDuration } from "../../../utils/format";
import { networkErrorMessage, SERVICE_NAMES } from "../../../utils/networkError";
import { ocrResultOf } from "../../../utils/ocr";
import { OCR_DONE_TITLE, OCR_FAILED_TITLE } from "../../../utils/ocrText";
import { speechResultOf } from "../../../utils/speech";
import { speechDoneTitle, speechFailedTitle } from "../../../utils/speechText";
import { toast } from "../../../utils/toast";
import { UPSCALE_DONE_TITLE, UPSCALE_FAILED_TITLE } from "../../../utils/upscaleText";

/** The name of a downloaded model, from whichever catalog lists it. */
function modelName(modelId: string): string {
  const { models, upscaleModels } = usePlaygroundStore.getState();
  const imageName = [...(models ?? []), ...(upscaleModels ?? [])].find(
    (m) => m.id === modelId,
  )?.name;
  const ocrName = useOcrStore.getState().models?.find((m) => m.id === modelId)?.name;
  const speechName = useSpeechStore.getState().models?.find((m) => m.id === modelId)?.name;
  return imageName ?? ocrName ?? speechName ?? modelId;
}

/** The drawer item of a model's Playground download, read from the store now. */
function playgroundItemOf(modelId: string): DownloadItem | undefined {
  return useDownloadStore.getState().downloads.find((d) => d.id === playgroundDownloadId(modelId));
}

/**
 * The service a model downloads from, named in a failure. The drawer item carries it (it is set when the
 * download starts). Hugging Face is only the fallback for an event with no item.
 */
function downloadSourceOf(modelId: string): string {
  const item = playgroundItemOf(modelId);
  return item ? downloadSourceName(item) : SERVICE_NAMES.huggingFace;
}

/** Re-read the catalog that lists the model, so its card shows Ready. Image and speech models have separate catalogs. */
function refreshCatalogFor(modelId: string): Promise<void> {
  if (usePlaygroundStore.getState().models?.some((m) => m.id === modelId)) {
    return playground
      .listImageModels()
      .then((list) => usePlaygroundStore.getState().setModels(list));
  }
  if (usePlaygroundStore.getState().upscaleModels?.some((m) => m.id === modelId)) {
    return playground
      .listUpscaleModels()
      .then((list) => usePlaygroundStore.getState().setUpscaleModels(list));
  }
  if (useOcrStore.getState().models?.some((m) => m.id === modelId)) {
    return playground.listOcrModels().then((list) => useOcrStore.getState().setModels(list));
  }
  if (useSpeechStore.getState().models?.some((m) => m.id === modelId)) {
    return playground.listSpeechModels().then((list) => useSpeechStore.getState().setModels(list));
  }
  return Promise.resolve();
}

/**
 * A finished model download. The drawer item is the one state the model rows read: a cancel marks it
 * cancelled (not failed), a failure keeps the raw error, and a success stays running until the catalog
 * is read again, so the card shows Ready (not Not downloaded) once the row stops showing the download.
 */
function handleDownloadDone(payload: PlaygroundDownloadDone) {
  const drawer = useDownloadStore.getState();
  const { modelId } = payload;

  if (payload.status === "cancelled") {
    drawer.cancelPlayground(modelId);
    return;
  }
  if (payload.status === "error") {
    const message = errorMessage(payload.error, "The download failed.");
    drawer.failPlayground(modelId, message);
    // A failure that retries by itself shows on its card, not as a toast per attempt.
    if (!willRetryAutomatically(playgroundItemOf(modelId))) {
      toast.error("Model download failed", networkErrorMessage(message, downloadSourceOf(modelId)));
    }
    return;
  }

  refreshCatalogFor(modelId)
    .catch((err: unknown) => {
      toast.error("Could not refresh the models", errorMessage(err));
    })
    .finally(() => {
      useDownloadStore.getState().finishPlayground(modelId);
    });
  toast.success("Model downloaded", modelName(modelId));
}

/** Progress of a model download: the drawer item's bar, byte counts, speed and file line. */
function handleDownloadProgress(payload: PlaygroundDownloadProgress) {
  useDownloadStore.getState().setPlaygroundProgress(payload.modelId, payload);
}

/** A finished generation: store the result. Toasts only for the job the store is waiting on. */
function handleImageDone(payload: PlaygroundImageDone) {
  const store = usePlaygroundStore.getState();
  const isCurrentJob = store.job?.jobId === payload.jobId;
  const isUpscale = store.job?.kind === "upscale";
  const result: ImageOutcome = {
    jobId: payload.jobId,
    status: payload.status,
    path: payload.path ?? null,
    error: payload.error ?? null,
    seed: payload.seed,
    seconds: payload.seconds,
  };
  store.finishJob(result);

  if (!isCurrentJob) return;
  if (payload.status === "done") {
    const took = payload.seconds === null ? null : formatDuration(payload.seconds * 1000);
    toast.success(
      isUpscale ? UPSCALE_DONE_TITLE : "Image ready",
      took ? `${isUpscale ? "Upscaled" : "Generated"} in ${took}` : undefined,
    );
  } else if (payload.status === "error") {
    toast.error(
      isUpscale ? UPSCALE_FAILED_TITLE : "Image generation failed",
      errorMessage(payload.error, "Unknown error."),
    );
  }
}

/** A finished OCR job: store its result. Toasts only for the job the store is waiting on. */
function handleOcrDone(payload: PlaygroundOcrDone) {
  const store = useOcrStore.getState();
  const isCurrentJob = store.job?.jobId === payload.jobId;
  store.finishJob(ocrResultOf(payload, store.input?.name ?? null));

  if (!isCurrentJob) return;
  if (payload.status === "done") {
    const took = payload.seconds === null ? null : formatDuration(payload.seconds * 1000);
    toast.success(OCR_DONE_TITLE, took ? `Read in ${took}` : undefined);
  } else if (payload.status === "error") {
    toast.error(OCR_FAILED_TITLE, errorMessage(payload.error, "Unknown error."));
  }
}

/** A finished speech job: store its result. Toasts only for the job the store is waiting on. */
function handleSpeechDone(payload: PlaygroundSpeechDone) {
  const store = useSpeechStore.getState();
  const isCurrentJob = store.job?.jobId === payload.jobId;
  store.finishJob(speechResultOf(payload));

  if (!isCurrentJob) return;
  if (payload.status === "ok") {
    toast.success(speechDoneTitle(payload.kind));
  } else if (payload.status === "error") {
    toast.error(speechFailedTitle(payload.kind), errorMessage(payload.error, "Unknown error."));
  }
}

/** Subscribes to the Playground events for the app's lifetime, so downloads and jobs keep updating on other pages. */
export function usePlaygroundEvents() {
  useTauriEvent<PlaygroundDownloadProgress>(
    playground.PLAYGROUND_DOWNLOAD_PROGRESS_EVENT,
    handleDownloadProgress,
  );
  useTauriEvent<PlaygroundDownloadDone>(
    playground.PLAYGROUND_DOWNLOAD_DONE_EVENT,
    handleDownloadDone,
  );
  useTauriEvent<PlaygroundImageProgress>(playground.PLAYGROUND_IMAGE_PROGRESS_EVENT, (payload) =>
    usePlaygroundStore.getState().setJobProgress(payload),
  );
  useTauriEvent<PlaygroundImageDone>(playground.PLAYGROUND_IMAGE_DONE_EVENT, handleImageDone);
  useTauriEvent<PlaygroundOcrDone>(playground.PLAYGROUND_OCR_DONE_EVENT, handleOcrDone);
  useTauriEvent<PlaygroundSpeechProgress>(playground.PLAYGROUND_SPEECH_PROGRESS_EVENT, (payload) =>
    useSpeechStore.getState().setJobProgress(payload),
  );
  useTauriEvent<PlaygroundSpeechDone>(playground.PLAYGROUND_SPEECH_DONE_EVENT, handleSpeechDone);
}
