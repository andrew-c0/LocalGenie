import { Button, Caption1 } from "@fluentui/react-components";
import {
  DismissRegular,
  DocumentRegular,
  ImageRegular,
  MusicNote2Regular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { readAttachment } from "../../../services/attachments";
import { fileExists } from "../../../services/system";
import type { AttachmentFile, AttachmentKind, AttachmentRef } from "../../../types";
import { attachmentKindLabel, shortFileName } from "../../../utils/attachments";
import { formatBytes } from "../../../utils/format";
import { toast } from "../../../utils/toast";
import { AttachmentPreview } from "../AttachmentPreview/AttachmentPreview";
import "./AttachmentList.css";

export const KIND_ICON: Record<AttachmentKind, typeof ImageRegular> = {
  image: ImageRegular,
  audio: MusicNote2Regular,
  text: DocumentRegular,
};

interface AttachmentListProps {
  attachments: AttachmentRef[];
  /** Given for files that can still be removed, such as the ones waiting for the next message. */
  onRemove?: (id: string) => void;
}

/**
 * Files attached to a message, as tiles. Clicking a tile opens its preview. If the file is no
 * longer at its path, a toast says so and nothing opens.
 */
export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  const [preview, setPreview] = useState<AttachmentFile | null>(null);

  const openPreview = async (file: AttachmentRef) => {
    if (!file.path || !(await fileExists(file.path).catch(() => false))) {
      toast.error("File not available", `${file.name} is no longer at its path on this device.`);
      return;
    }
    try {
      setPreview(await readAttachment(file.path));
    } catch (err) {
      toast.error("File not available", `${file.name} could not be opened: ${String(err)}`);
    }
  };

  return (
    <>
      <ul className="attachment-list">
        {attachments.map((file) => {
          const Icon = KIND_ICON[file.kind];
          return (
            <li key={file.id} className="attachment-tile">
              <button
                type="button"
                className="attachment-tile__open"
                onClick={() => void openPreview(file)}
                title={`Preview ${file.name}`}
              >
                <Icon
                  aria-hidden
                  className={`attachment-tile__icon attachment-kind--${file.kind}`}
                />
                <span className="attachment-tile__text">
                  <span className="attachment-tile__name" title={file.name}>
                    {shortFileName(file.name)}
                  </span>
                  <Caption1 className="attachment-tile__meta">
                    {attachmentKindLabel(file.kind)} · {formatBytes(file.size)}
                  </Caption1>
                </span>
              </button>
              {onRemove && (
                <Button
                  type="button"
                  appearance="subtle"
                  size="small"
                  className="attachment-tile__remove"
                  icon={<DismissRegular />}
                  onClick={() => onRemove(file.id)}
                  aria-label={`Remove ${file.name}`}
                  title="Remove"
                />
              )}
            </li>
          );
        })}
      </ul>
      <AttachmentPreview file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
