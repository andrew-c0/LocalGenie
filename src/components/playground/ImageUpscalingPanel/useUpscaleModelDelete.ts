import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { UpscaleModel } from "../../../types";
import { type PlaygroundModelDelete, usePlaygroundModelDelete } from "../usePlaygroundModelDelete";

/** Deletes an upscaling model's file, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
async function deleteUpscaleModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteUpscaleModel(modelId);
  const list = await playground.listUpscaleModels();
  usePlaygroundStore.getState().replaceUpscaleModelsAfterDelete(list, modelId);
  return freedBytes;
}

/** Delete for downloaded upscaling models. */
export function useUpscaleModelDelete(): PlaygroundModelDelete<UpscaleModel> {
  return usePlaygroundModelDelete<UpscaleModel>(deleteUpscaleModelAndRefresh);
}
