import { invoke } from "@tauri-apps/api/core";
import type {
  ImageGenerateRequest,
  ImageModel,
  PlaygroundDeleteResult,
  PlaygroundDevice,
  SpeechModel,
  SpeechSynthesizeRequest,
  SpeechTranscribeRequest,
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
/** Event carrying `PlaygroundSpeechProgress` while a transcription or a speech synthesis runs. */
export const PLAYGROUND_SPEECH_PROGRESS_EVENT = "playground-speech-progress";
/** Event carrying `PlaygroundSpeechDone` once a speech job ends. */
export const PLAYGROUND_SPEECH_DONE_EVENT = "playground-speech-done";

/** The download id the backend uses for a model, image or speech. `cancel_download` takes this id. */
export function playgroundDownloadId(modelId: string): string {
  return `playground:${modelId}`;
}

/** Every image model the Playground knows, with its download state. */
export async function listImageModels(): Promise<ImageModel[]> {
  return invoke("playground_image_models");
}

/** Download every file of an image model. Resolves when the download has finished. */
export async function downloadImageModel(modelId: string): Promise<void> {
  return invoke("playground_download_model", { modelId });
}

/** Stop a model download, image or speech. The backend reports the stop through `playground-download-done`. */
export async function cancelModelDownload(modelId: string): Promise<void> {
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

/** Read the picture an image to image job edits, as a data URL, so the webview can show it. */
export async function readInputImage(path: string): Promise<string> {
  return invoke("playground_read_input_image", { path });
}

/** Open the folder of a saved image with the file selected. */
export async function revealImage(path: string): Promise<void> {
  return invoke("playground_reveal_image", { path });
}

/** Every speech model (speech to text and text to speech) with its download state and voices. */
export async function listSpeechModels(): Promise<SpeechModel[]> {
  return invoke("playground_speech_models");
}

/** Download every file of a speech model. Resolves when the download has finished. */
export async function downloadSpeechModel(modelId: string): Promise<void> {
  return invoke("playground_download_speech_model", { modelId });
}

/** Delete a speech model's files that no other downloaded model uses. Rejects while it downloads or a job runs. */
export async function deleteSpeechModel(modelId: string): Promise<PlaygroundDeleteResult> {
  return invoke("playground_delete_speech_model", { modelId });
}

/** Start a transcription. Resolves right after the job starts; the transcript comes as an event. */
export async function transcribeSpeech(request: SpeechTranscribeRequest): Promise<void> {
  return invoke("playground_transcribe", { request });
}

/** Start a speech synthesis. Resolves right after the job starts; the saved file comes as an event. */
export async function synthesizeSpeech(request: SpeechSynthesizeRequest): Promise<void> {
  return invoke("playground_synthesize", { request });
}

/** Stop a running speech job. The backend reports the stop through `playground-speech-done`. */
export async function cancelSpeech(jobId: string): Promise<void> {
  return invoke("playground_cancel_speech", { jobId });
}

/** Save a recording as a temp WAV copy. Resolves to the saved file's path. `bytes` is the whole file. */
export async function storeAudio(bytes: number[], extension: string): Promise<string> {
  return invoke("playground_store_audio", { bytes, extension });
}

/** Read a saved audio file as a data URL, so the webview's audio player can play it. */
export async function readAudio(path: string): Promise<string> {
  return invoke("playground_read_audio", { path });
}

/** Open the folder of a saved audio file with the file selected. */
export async function revealAudio(path: string): Promise<void> {
  return invoke("playground_reveal_audio", { path });
}
