import { deleteSpeechModel, listSpeechModels } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechModel } from "../../../types";
import { type PlaygroundModelDelete, usePlaygroundModelDelete } from "../usePlaygroundModelDelete";

/** Deletes a speech model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
async function deleteSpeechModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await deleteSpeechModel(modelId);
  const list = await listSpeechModels();
  useSpeechStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}

/** Delete for downloaded speech models. */
export function useSpeechModelDelete(): PlaygroundModelDelete<SpeechModel> {
  return usePlaygroundModelDelete<SpeechModel>(deleteSpeechModelAndRefresh);
}
