import type { ImageModel } from "../../../../types";
import { formatBytes } from "../../../../utils/format";
import { freedBytesOnDelete } from "../../../../utils/playground";
import { deleteModelMessage, deleteModelTitle } from "../../../../utils/playgroundText";
import { ConfirmDialog } from "../../../ui/ConfirmDialog/ConfirmDialog";

interface ImageModelDeleteDialogProps {
  model: ImageModel;
  /** The whole catalog, so the size leaves out the files other downloaded models use. */
  models: ImageModel[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation before a model's files are deleted, with the disk space that comes back. */
export function ImageModelDeleteDialog({
  model,
  models,
  onConfirm,
  onCancel,
}: ImageModelDeleteDialogProps) {
  const freedSize = formatBytes(freedBytesOnDelete(model, models));
  return (
    <ConfirmDialog
      title={deleteModelTitle(model.name)}
      message={deleteModelMessage(freedSize)}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
