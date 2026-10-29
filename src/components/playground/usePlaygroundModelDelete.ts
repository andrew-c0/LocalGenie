import { useState } from "react";
import { errorMessage } from "../../utils/errorMessage";
import { formatBytes } from "../../utils/format";
import { toast } from "../../utils/toast";

export interface PlaygroundModelDelete<M extends { id: string }> {
  /** The model waiting for confirmation, or null. */
  pendingModel: M | null;
  /** The model whose files are being deleted, or null. */
  deletingModelId: string | null;
  requestDelete: (model: M) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

/**
 * Delete for downloaded models of one Playground tab: the model waiting for confirmation, and the one
 * being deleted. `deleteAndRefresh` deletes the model's files and re-reads the catalog; it resolves
 * with the bytes freed.
 */
export function usePlaygroundModelDelete<M extends { id: string }>(
  deleteAndRefresh: (modelId: string) => Promise<number>,
): PlaygroundModelDelete<M> {
  const [pendingModel, setPendingModel] = useState<M | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  const requestDelete = (model: M) => setPendingModel(model);

  const cancelDelete = () => setPendingModel(null);

  const confirmDelete = () => {
    if (!pendingModel) return;
    const modelId = pendingModel.id;
    setPendingModel(null);
    setDeletingModelId(modelId);
    deleteAndRefresh(modelId)
      .then((freedBytes) => toast.success("Model deleted", `Freed ${formatBytes(freedBytes)}.`))
      .catch((err: unknown) => toast.error("Could not delete the model", errorMessage(err)))
      .finally(() => setDeletingModelId(null));
  };

  return { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete };
}
