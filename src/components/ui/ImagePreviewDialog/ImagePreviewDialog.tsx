import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import "./ImagePreviewDialog.css";

interface ImagePreviewDialogProps {
  open: boolean;
  /** The file name, shown in the title and clipped when long. */
  title: string;
  /** The picture as a data URL or any other image source. */
  src: string;
  onClose: () => void;
  /** Shows the file in Explorer. The button appears only when this is given. */
  onOpenLocation?: () => void;
}

/** Modal view of one picture, scaled to fit the dialog. Closes with Close or Escape. */
export function ImagePreviewDialog({
  open,
  title,
  src,
  onClose,
  onOpenLocation,
}: ImagePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className="image-preview-dialog">
        <DialogBody>
          <DialogTitle className="image-preview-dialog__title">
            <span className="image-preview-dialog__name" title={title}>
              {title}
            </span>
          </DialogTitle>
          <DialogContent className="image-preview-dialog__content">
            <img className="image-preview-dialog__image" src={src} alt={title} />
          </DialogContent>
          <DialogActions position="end">
            {onOpenLocation && (
              <Button type="button" appearance="secondary" onClick={onOpenLocation}>
                Open location
              </Button>
            )}
            <Button type="button" appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
