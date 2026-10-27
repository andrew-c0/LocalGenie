import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";
import "./EditorDialog.css";

interface EditorDialogProps {
  title: string;
  /** True when the form differs from the saved item. Closing then asks before it discards. */
  dirty: boolean;
  /** Called when the dialog really closes: the close button, Escape or outside click, and then a
   * confirmed discard. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal for one item's editor. Closing it with unsaved changes asks first. The editor is unmounted
 * on close, so its fields start empty the next time it opens.
 */
export function EditorDialog({ title, dirty, onClose, children }: EditorDialogProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const requestClose = () => {
    if (dirty) {
      setConfirmingDiscard(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(_, data) => {
          if (!data.open) requestClose();
        }}
      >
        <DialogSurface className="editor-dialog">
          <DialogBody>
            <DialogTitle
              action={
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  aria-label="Close editor"
                  onClick={requestClose}
                />
              }
            >
              {title}
            </DialogTitle>
            <DialogContent className="editor-dialog__content">{children}</DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          message="Changes made since the last save will be lost."
          confirmLabel="Discard"
          onConfirm={onClose}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </>
  );
}
