import type { PlaygroundLocalGroup, PlaygroundLocalModel } from "../../utils/playgroundLocalModels";
import { deleteImageModelAndRefresh } from "../playground/ImageModels/deleteImageModel";
import { deleteUpscaleModelAndRefresh } from "../playground/ImageUpscalingPanel/deleteUpscaleModel";
import { deleteOcrModelAndRefresh } from "../playground/OcrPanel/deleteOcrModel";
import { deleteSpeechModelAndRefresh } from "../playground/SpeechModels/deleteSpeechModel";
import {
  type PlaygroundModelDelete,
  usePlaygroundModelDelete,
} from "../playground/usePlaygroundModelDelete";

/** The delete of each tool's catalog. Image to image shares the image catalog; the audio tasks share the speech one. */
const DELETE_BY_GROUP: Record<PlaygroundLocalGroup, (modelId: string) => Promise<number>> = {
  imageGeneration: deleteImageModelAndRefresh,
  imageToImage: deleteImageModelAndRefresh,
  upscale: deleteUpscaleModelAndRefresh,
  stt: deleteSpeechModelAndRefresh,
  tts: deleteSpeechModelAndRefresh,
  audioToAudio: deleteSpeechModelAndRefresh,
  ocr: deleteOcrModelAndRefresh,
};

/**
 * Delete for the installed Playground models listed on the Playground models page. It reuses the delete of
 * each tool's panel (its files, then its catalog re-read) through the shared confirm state. The
 * model's tool is found in `models`, which is the list the page shows.
 */
export function usePlaygroundLocalDelete(
  models: PlaygroundLocalModel[],
): PlaygroundModelDelete<PlaygroundLocalModel> {
  return usePlaygroundModelDelete<PlaygroundLocalModel>((modelId) => {
    const model = models.find((candidate) => candidate.id === modelId);
    if (!model) return Promise.reject(new Error("This model is no longer installed."));
    return DELETE_BY_GROUP[model.kind](modelId);
  });
}
