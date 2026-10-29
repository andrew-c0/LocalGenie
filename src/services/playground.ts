import { invoke } from "@tauri-apps/api/core";
import type {
  ImageGenerateRequest,
  ImageModel,
  PlaygroundDeleteResult,
  PlaygroundDevice,
} from "../types";
import { cancelDownload } from "./download";

/** Event carrying `PlaygroundDownloadProgress` while a model's files are fetched. */
export const PLAYGROUND_DOWNLOAD_PROGRESS_EVENT = "playground-download-progress";
/** Event carrying `PlaygroundDownloadDone` once a model download ends. */
export const PLAYGROUND_DOWNLOAD_DONE_EVENT = "playground-download-done";
/** Event carrying `PlaygroundImageProgress` while an image is generated. */
export const PLAYGROUND_IMAGE_PROGRESS_EVENT = "playground-image-progress";
/** Event carrying `PlaygroundImageDone` once a generation ends. */
export const PLAYGROUND_IMAGE_DONE_EVENT = "playground-image-done";

/** The download id the backend uses for a model. `cancel_download` takes this id. */
export function playgroundDownloadId(modelId: string): string {
  return `playground:${modelId}`;
}

/** Every image model the Playground knows, with its download state. */
export async function listImageModels(): Promise<ImageModel[]> {
  return invoke("playground_image_models");
}

/** Download every file of a model. Resolves when the download has finished. */
export async function downloadImageModel(modelId: string): Promise<void> {
  return invoke("playground_download_model", { modelId });
}

/** Stop a model download. The backend reports the stop through `playground-download-done`. */
export async function cancelImageModelDownload(modelId: string): Promise<void> {
  return cancelDownload(playgroundDownloadId(modelId));
}

/** Compute devices the installed stable-diffusion.cpp build reports. Rejects when the runtime is not installed. */
export async function listComputeDevices(): Promise<PlaygroundDevice[]> {
  return invoke("playground_list_devices");
}

/** Delete a model's files that no other downloaded model uses. Rejects while it downloads or a generation runs. */
export async function deleteImageModel(modelId: string): Promise<PlaygroundDeleteResult> {
  return invoke("playground_delete_model", { modelId });
}

/** Start an image generation. Resolves right after the job starts; the result comes as an event. */
export async function generateImage(request: ImageGenerateRequest): Promise<void> {
  return invoke("playground_generate_image", { request });
}

/** Stop a running generation. The backend reports the stop through `playground-image-done`. */
export async function cancelImage(jobId: string): Promise<void> {
  return invoke("playground_cancel_image", { jobId });
}

/** Read a saved image as a data URL, so the webview can show it. */
export async function readImage(path: string): Promise<string> {
  return invoke("playground_read_image", { path });
}

/** Open the folder of a saved image with the file selected. */
export async function revealImage(path: string): Promise<void> {
  return invoke("playground_reveal_image", { path });
}
