import type { ImageModel, OcrModel, SpeechKind, SpeechModel, UpscaleModel } from "../types";
import { isEnhanceKind } from "./audioEnhance";
import { formatBytes } from "./format";
import { isImageToImageModel } from "./imageToImage";
import { deleteModelMessage } from "./playgroundText";

/**
 * The Playground tool a model is listed under on the Playground models page. Image to image and audio
 * to audio are their own groups, although their models come from the image and speech catalogs.
 */
export type PlaygroundLocalGroup =
  | "imageGeneration"
  | "imageToImage"
  | "upscale"
  | "stt"
  | "tts"
  | "audioToAudio"
  | "ocr";

/** The groups in the order the list shows them. */
export const PLAYGROUND_LOCAL_GROUPS: readonly PlaygroundLocalGroup[] = [
  "imageGeneration",
  "imageToImage",
  "upscale",
  "stt",
  "tts",
  "audioToAudio",
  "ocr",
];

export const PLAYGROUND_GROUP_LABELS: Record<PlaygroundLocalGroup, string> = {
  imageGeneration: "Image generation",
  imageToImage: "Image to image",
  upscale: "Upscaling",
  stt: "Speech to text",
  tts: "Text to speech",
  audioToAudio: "Clean up and split",
  ocr: "OCR",
};

/** An installed Playground model, from whichever catalog lists it. */
export interface PlaygroundLocalModel {
  id: string;
  /** The tool the model belongs to. */
  kind: PlaygroundLocalGroup;
  /** The model's name, as shown on its row. */
  label: string;
  /** Size of the model's files, when its catalog lists one. */
  sizeBytes?: number;
}

/** The four Playground catalogs as their stores hold them. Null until the catalog has been read. */
export interface PlaygroundCatalogs {
  image: ImageModel[] | null;
  upscale: UpscaleModel[] | null;
  speech: SpeechModel[] | null;
  ocr: OcrModel[] | null;
}

/** The body of the delete dialog: the size is left out when the catalog does not list one. */
export function deleteBodyOf(model: PlaygroundLocalModel): string {
  return model.sizeBytes === undefined
    ? "You can download it again later. Files shared with other downloaded models are kept."
    : deleteModelMessage(formatBytes(model.sizeBytes));
}

/** The group of a speech model: speech to text, text to speech, or one of the two audio to audio tasks. */
export function speechGroupOf(kind: SpeechKind): PlaygroundLocalGroup {
  if (isEnhanceKind(kind)) return "audioToAudio";
  return kind === "tts" ? "tts" : "stt";
}

/**
 * Every downloaded model across the four catalogs, in catalog order. An image model that takes an
 * input picture is listed under image to image, the others under image generation, so each model
 * appears once.
 */
export function collectInstalledPlaygroundModels(
  catalogs: PlaygroundCatalogs,
): PlaygroundLocalModel[] {
  const image = (catalogs.image ?? [])
    .filter((model) => model.downloaded)
    .map(
      (model): PlaygroundLocalModel => ({
        id: model.id,
        kind: isImageToImageModel(model) ? "imageToImage" : "imageGeneration",
        label: model.name,
        sizeBytes: model.totalBytes,
      }),
    );
  const upscale = (catalogs.upscale ?? [])
    .filter((model) => model.downloaded)
    .map(
      (model): PlaygroundLocalModel => ({
        id: model.id,
        kind: "upscale",
        label: model.name,
        sizeBytes: model.sizeBytes,
      }),
    );
  const speech = (catalogs.speech ?? [])
    .filter((model) => model.downloaded)
    .map(
      (model): PlaygroundLocalModel => ({
        id: model.id,
        kind: speechGroupOf(model.kind),
        label: model.name,
        sizeBytes: model.sizeBytes,
      }),
    );
  const ocr = (catalogs.ocr ?? [])
    .filter((model) => model.downloaded)
    .map(
      (model): PlaygroundLocalModel => ({
        id: model.id,
        kind: "ocr",
        label: model.name,
        sizeBytes: model.sizeBytes,
      }),
    );
  return [...image, ...upscale, ...speech, ...ocr];
}
