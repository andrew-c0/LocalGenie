import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import type { PlaygroundModelKind } from "../../types";
import { speechKindOfTask } from "../../utils/audioTask";
import type { ComputeSetting, RunOnValue } from "../../utils/playgroundCompute";
import { imageDeviceForRunOn } from "../../utils/playgroundCompute";
import type { PlaygroundToolId, SelectorModel } from "../../utils/playgroundSelector";
import { beginPlaygroundDownload } from "../shell/DownloadDrawer/playgroundDownloads";
import { startOcrServer } from "./OcrPanel/startOcrServer";

/**
 * Makes a catalog model the tool's model, the way the tool's own picker did: text to image takes the
 * model's defaults for its form, image to image also takes the input picture's size, and the speech
 * and OCR models are set on their stores. Selecting a model never opens the tool.
 */
export function selectToolModel(toolId: PlaygroundToolId, modelId: string): void {
  switch (toolId) {
    case "playground-text-to-image": {
      const store = usePlaygroundStore.getState();
      const model = store.models?.find((candidate) => candidate.id === modelId);
      if (model) store.selectModel(model);
      return;
    }
    case "playground-image-to-image": {
      const store = usePlaygroundStore.getState();
      const model = store.models?.find((candidate) => candidate.id === modelId);
      if (model) store.selectEditModel(model);
      return;
    }
    case "playground-image-upscaling":
      usePlaygroundStore.getState().selectUpscaleModel(modelId);
      return;
    case "playground-ocr":
      useOcrStore.getState().selectModel(modelId);
      return;
    case "playground-audio": {
      const store = useSpeechStore.getState();
      const model = store.models?.find((candidate) => candidate.id === modelId);
      if (model) store.selectModel(model);
      return;
    }
  }
}

/** Clears the tool's model, so nothing is selected until the user picks one again. */
export function clearToolModel(toolId: PlaygroundToolId): void {
  switch (toolId) {
    case "playground-text-to-image":
    case "playground-image-to-image":
      usePlaygroundStore.getState().clearModelSelection();
      return;
    case "playground-image-upscaling":
      usePlaygroundStore.getState().clearUpscaleModelSelection();
      return;
    case "playground-ocr":
      useOcrStore.getState().clearModelSelection();
      return;
    case "playground-audio": {
      const store = useSpeechStore.getState();
      store.clearModelSelection(speechKindOfTask(store.audioTask, store.enhanceKind));
      return;
    }
  }
}

/**
 * The selector's click on an installed model. A model the tool does not use yet is picked, and an OCR
 * model also starts the GenieX server it runs on. The model the tool uses is cleared instead.
 */
export function toggleToolModel(
  toolId: PlaygroundToolId,
  modelId: string,
  isSelected: boolean,
): void {
  if (isSelected) {
    clearToolModel(toolId);
    return;
  }
  selectToolModel(toolId, modelId);
  if (toolId === "playground-ocr") void startOcrServer();
}

/** Starts a catalog model's download. The drawer shows it, and Retry uses the same call. */
export function downloadCatalogModel(
  catalog: PlaygroundModelKind,
  model: Pick<SelectorModel, "id" | "name">,
): void {
  beginPlaygroundDownload({ kind: catalog, modelId: model.id, name: model.name });
}

/**
 * Writes one "Run on" choice to the store it belongs to. The image device is the form's device, so a
 * generate request sends the same value as it did from the tool's own field. OCR's two choices are
 * the language model's compute and the vision encoder's, which takes only CPU or NPU.
 */
export function chooseRunOn(setting: ComputeSetting, value: RunOnValue): void {
  switch (setting) {
    case "device": {
      const store = usePlaygroundStore.getState();
      store.setForm({ device: imageDeviceForRunOn(value, store.devices ?? []) });
      return;
    }
    case "ocrCompute":
      useOcrStore.getState().setCompute(value);
      return;
    case "ocrVision":
      if (value === "cpu" || value === "npu") useOcrStore.getState().setVisionCompute(value);
      return;
  }
}
