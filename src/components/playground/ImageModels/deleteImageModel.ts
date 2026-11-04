import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";

/** Deletes a model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
export async function deleteImageModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteImageModel(modelId);
  const list = await playground.listImageModels();
  usePlaygroundStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}
