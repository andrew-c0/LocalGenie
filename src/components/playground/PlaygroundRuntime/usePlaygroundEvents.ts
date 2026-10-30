import { useTauriEvent } from "../../../hooks";
import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { useSpeechStore } from "../../../stores/speechStore";
import type {
  ImageOutcome,
  PlaygroundDownloadDone,
  PlaygroundDownloadProgress,
  PlaygroundImageDone,
  PlaygroundImageProgress,
  PlaygroundSpeechDone,
  PlaygroundSpeechProgress,
} from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { formatDuration } from "../../../utils/format";
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
  const speechName = useSpeechStore.getState().models?.find((m) => m.id === modelId)?.name;
  return imageName ?? speechName ?? modelId;
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
  if (useSpeechStore.getState().models?.some((m) => m.id === modelId)) {
    return playground.listSpeechModels().then((list) => useSpeechStore.getState().setModels(list));
  }
  return Promise.resolve();
}

/** A finished model download: refresh the catalog so the card shows Ready, then drop the download entry. */
function handleDownloadDone(payload: PlaygroundDownloadDone) {
  const store = usePlaygroundStore.getState();
  const { modelId } = payload;

  if (payload.status === "cancelled") {
    store.markDownloadCancelled(modelId);
    return;
  }
  if (payload.status === "error") {
    const message = errorMessage(payload.error, "The download failed.");
    store.failDownload(modelId, message);
    toast.error("Model download failed", message);
    return;
  }

  refreshCatalogFor(modelId)
    .catch((err: unknown) => {
      toast.error("Could not refresh the models", errorMessage(err));
    })
    .finally(() => {
      usePlaygroundStore.getState().clearDownload(modelId);
    });
  toast.success("Model downloaded", modelName(modelId));
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
    (payload) => usePlaygroundStore.getState().setDownloadProgress(payload),
  );
  useTauriEvent<PlaygroundDownloadDone>(
    playground.PLAYGROUND_DOWNLOAD_DONE_EVENT,
    handleDownloadDone,
  );
  useTauriEvent<PlaygroundImageProgress>(playground.PLAYGROUND_IMAGE_PROGRESS_EVENT, (payload) =>
    usePlaygroundStore.getState().setJobProgress(payload),
  );
  useTauriEvent<PlaygroundImageDone>(playground.PLAYGROUND_IMAGE_DONE_EVENT, handleImageDone);
  useTauriEvent<PlaygroundSpeechProgress>(playground.PLAYGROUND_SPEECH_PROGRESS_EVENT, (payload) =>
    useSpeechStore.getState().setJobProgress(payload),
  );
  useTauriEvent<PlaygroundSpeechDone>(playground.PLAYGROUND_SPEECH_DONE_EVENT, handleSpeechDone);
}
