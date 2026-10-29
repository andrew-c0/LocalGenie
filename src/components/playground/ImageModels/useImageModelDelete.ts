import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageModel } from "../../../types";
import { type PlaygroundModelDelete, usePlaygroundModelDelete } from "../usePlaygroundModelDelete";

/** Deletes a model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
async function deleteImageModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteImageModel(modelId);
  const list = await playground.listImageModels();
  usePlaygroundStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}

/** Delete for downloaded image models. */
export function useImageModelDelete(): PlaygroundModelDelete<ImageModel> {
  return usePlaygroundModelDelete<ImageModel>(deleteImageModelAndRefresh);
}
