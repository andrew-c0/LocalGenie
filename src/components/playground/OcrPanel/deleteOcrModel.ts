import * as playground from "../../../services/playground";
import { useOcrStore } from "../../../stores/ocrStore";

/** Deletes an OCR model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
export async function deleteOcrModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteOcrModel(modelId);
  const list = await playground.listOcrModels();
  useOcrStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}
