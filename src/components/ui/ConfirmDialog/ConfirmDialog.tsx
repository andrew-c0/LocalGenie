import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation dialog. Rendered by the caller only while it should be shown. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{message}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
