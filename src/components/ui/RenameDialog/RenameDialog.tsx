import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
} from "@fluentui/react-components";
import { useState } from "react";
import "./RenameDialog.css";

interface RenameDialogProps {
  title: string;
  /** The name shown when the dialog opens. */
  initialValue: string;
  maxLength?: number;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * Modal with one text field and Save / Cancel. Save needs a non-empty name that differs from the
 * current one. Rendered by the caller only while it should be shown.
 */
export function RenameDialog({
  title,
  initialValue,
  maxLength = 120,
  onSave,
  onCancel,
}: RenameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initialValue;

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onCancel();
      }}
    >
      <DialogSurface>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) onSave(trimmed);
          }}
        >
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
              <Input
                autoFocus
                className="rename-dialog__input"
                aria-label={title}
                value={value}
                maxLength={maxLength}
                onChange={(_, data) => setValue(data.value)}
              />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" appearance="primary" disabled={!canSave}>
                Save
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
