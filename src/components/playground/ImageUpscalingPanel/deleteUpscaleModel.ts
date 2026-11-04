import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";

/** Deletes an upscaling model's file, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
export async function deleteUpscaleModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteUpscaleModel(modelId);
  const list = await playground.listUpscaleModels();
  usePlaygroundStore.getState().replaceUpscaleModelsAfterDelete(list, modelId);
  return freedBytes;
}
