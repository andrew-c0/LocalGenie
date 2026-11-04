import { deleteSpeechModel, listSpeechModels } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";

/** Deletes a speech model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
export async function deleteSpeechModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await deleteSpeechModel(modelId);
  const list = await listSpeechModels();
  useSpeechStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}
