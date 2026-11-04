import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";

interface DeleteConversationDialogProps {
  /** The conversation's title, named in the question. */
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before a conversation and its messages are deleted. Rendered by the caller only while it should show. */
export function DeleteConversationDialog({
  title,
  onConfirm,
  onCancel,
}: DeleteConversationDialogProps) {
  return (
    <ConfirmDialog
      title="Delete conversation"
      message={
        <>
          Delete <strong>{title}</strong>? This cannot be undone.
        </>
      }
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
