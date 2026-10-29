import { useTauriEvent } from "../../../hooks";
import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type {
  ImageResult,
  PlaygroundDownloadDone,
  PlaygroundDownloadProgress,
  PlaygroundImageDone,
  PlaygroundImageProgress,
} from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { formatDuration } from "../../../utils/format";
import { toast } from "../../../utils/toast";

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

  const name = store.models?.find((m) => m.id === modelId)?.name ?? modelId;
  playground
    .listImageModels()
    .then((list) => usePlaygroundStore.getState().setModels(list))
    .catch((err: unknown) => {
      toast.error("Could not refresh the image models", errorMessage(err));
    })
    .finally(() => {
      usePlaygroundStore.getState().clearDownload(modelId);
    });
  toast.success("Model downloaded", name);
}

/** A finished generation: store the result. Toasts only for the job the store is waiting on. */
function handleImageDone(payload: PlaygroundImageDone) {
  const store = usePlaygroundStore.getState();
  const isCurrentJob = store.job?.jobId === payload.jobId;
  const result: Omit<ImageResult, "device"> = {
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
    toast.success("Image ready", took ? `Generated in ${took}` : undefined);
  } else if (payload.status === "error") {
    toast.error("Image generation failed", errorMessage(payload.error, "Unknown error."));
  }
}

/** Subscribes to the four Playground events for the app's lifetime, so downloads and images keep updating on other pages. */
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
}
