import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { revealAttachment } from "../../../services/attachments";
import type { AttachmentFile } from "../../../types";
import { toast } from "../../../utils/toast";
import "./AttachmentPreview.css";

interface AttachmentPreviewProps {
  /** The file to show, already read from disk. Null keeps the dialog closed. */
  file: AttachmentFile | null;
  onClose: () => void;
}

/**
 * Modal preview of an image, text file or audio clip. Closes with Close or Escape. Open location
 * shows the file in Explorer; if the file is gone, a toast says so.
 */
export function AttachmentPreview({ file, onClose }: AttachmentPreviewProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className="attachment-preview">
        {file && (
          <DialogBody>
            <DialogTitle className="attachment-preview__title">
              <span className="attachment-preview__name" title={file.name}>
                {file.name}
              </span>
            </DialogTitle>
            <DialogContent className="attachment-preview__content">
              <PreviewBody file={file} />
            </DialogContent>
            <DialogActions position="end">
              <Button type="button" appearance="secondary" onClick={() => openLocation(file)}>
                Open location
              </Button>
              <Button type="button" appearance="primary" onClick={onClose}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        )}
      </DialogSurface>
    </Dialog>
  );
}

async function openLocation(file: AttachmentFile) {
  try {
    await revealAttachment(file.path);
  } catch (err) {
    toast.error("File not available", `${file.name} could not be shown: ${String(err)}`);
  }
}

function PreviewBody({ file }: { file: AttachmentFile }) {
  if (file.kind === "text") {
    return <pre className="attachment-preview__text">{file.text}</pre>;
  }
  if (!file.data || !file.mime) return null;
  const url = `data:${file.mime};base64,${file.data}`;
  if (file.kind === "image") {
    return <img className="attachment-preview__image" src={url} alt={file.name} />;
  }
  // biome-ignore lint/a11y/useMediaCaption: the clip is the user's own file and has no captions to show
  return <audio className="attachment-preview__audio" controls preload="metadata" src={url} />;
}
