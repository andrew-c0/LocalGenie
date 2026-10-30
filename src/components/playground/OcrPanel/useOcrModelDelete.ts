import * as playground from "../../../services/playground";
import { useOcrStore } from "../../../stores/ocrStore";
import type { OcrModel } from "../../../types";
import { type PlaygroundModelDelete, usePlaygroundModelDelete } from "../usePlaygroundModelDelete";

/** Deletes an OCR model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
async function deleteOcrModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteOcrModel(modelId);
  const list = await playground.listOcrModels();
  useOcrStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}

/** Delete for downloaded OCR models. */
export function useOcrModelDelete(): PlaygroundModelDelete<OcrModel> {
  return usePlaygroundModelDelete<OcrModel>(deleteOcrModelAndRefresh);
}
