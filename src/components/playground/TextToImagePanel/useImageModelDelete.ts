import { useState } from "react";
import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageModel } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { formatBytes } from "../../../utils/format";
import { toast } from "../../../utils/toast";

/** Deletes a model's files, then re-reads the catalog so the card shows Not downloaded. Resolves with the bytes freed. */
async function deleteModelAndRefresh(modelId: string): Promise<number> {
  const { freedBytes } = await playground.deleteImageModel(modelId);
  const list = await playground.listImageModels();
  usePlaygroundStore.getState().replaceModelsAfterDelete(list, modelId);
  return freedBytes;
}

/** Delete for downloaded image models: the model waiting for confirmation, and the one being deleted. */
export function useImageModelDelete() {
  const [pendingModel, setPendingModel] = useState<ImageModel | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  const requestDelete = (model: ImageModel) => setPendingModel(model);

  const cancelDelete = () => setPendingModel(null);

  const confirmDelete = () => {
    if (!pendingModel) return;
    const modelId = pendingModel.id;
    setPendingModel(null);
    setDeletingModelId(modelId);
    deleteModelAndRefresh(modelId)
      .then((freedBytes) => toast.success("Model deleted", `Freed ${formatBytes(freedBytes)}.`))
      .catch((err: unknown) => toast.error("Could not delete the model", errorMessage(err)))
      .finally(() => setDeletingModelId(null));
  };

  return { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete };
}
