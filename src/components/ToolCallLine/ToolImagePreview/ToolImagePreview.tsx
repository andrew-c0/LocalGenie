import { type ReactNode, useState } from "react";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { readAttachment } from "../../../services/attachments";
import type { AttachmentRef } from "../../../types";
import { shortFileName } from "../../../utils/attachments";
import { thumbnailSource } from "../../../utils/toolImage";
import { AttachmentPreview } from "../../chat/AttachmentPreview/AttachmentPreview";
import { SkeletonBlock } from "../../ui/Skeletons/SkeletonBlock";
import { Meta } from "../../ui/Typography/Typography";
import "./ToolImagePreview.css";

/** Height of the thumbnail box, and of the skeleton that stands in for it while the file loads. */
const THUMB_HEIGHT = 160;

interface ToolImagePreviewProps {
  /** The image the tool looked at. Mounted only while the tool line is open, so nothing loads when collapsed. */
  image: AttachmentRef;
}

/**
 * A small thumbnail of the image a read_image call looked at, with its file name under it. The file
 * is read when this mounts. Clicking the thumbnail opens the shared attachment preview. A file that is
 * gone or cannot be read shows the missing-file note instead.
 */
export function ToolImagePreview({ image }: ToolImagePreviewProps) {
  const loaded = useAsyncData(image.path ?? null, readAttachment);
  const [open, setOpen] = useState(false);
  const file = loaded.data;
  const src = thumbnailSource(file);

  let thumbnail: ReactNode;
  if (!image.path) {
    thumbnail = <MissingNote title="No path was kept for this image." />;
  } else if (loaded.status === "error") {
    thumbnail = <MissingNote title={String(loaded.error)} />;
  } else if (loaded.status === "loading") {
    thumbnail = (
      <div className="tool-image__placeholder">
        <SkeletonBlock height={THUMB_HEIGHT} />
      </div>
    );
  } else if (!file || !src) {
    thumbnail = <MissingNote title="The file could not be shown as an image." />;
  } else {
    thumbnail = (
      <>
        <button
          type="button"
          className="tool-image__open"
          onClick={() => setOpen(true)}
          title={`Preview ${image.name}`}
        >
          <img className="tool-image__picture" src={src} alt={image.name} />
        </button>
        <AttachmentPreview file={open ? file : null} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <div className="tool-image">
      {thumbnail}
      <Meta className="tool-image__name" title={image.name}>
        {shortFileName(image.name)}
      </Meta>
    </div>
  );
}

/** The missing-file note. The technical reason sits in the title, so it is not lost. */
function MissingNote({ title }: { title: string }) {
  return (
    <Meta className="tool-image__missing" title={title}>
      File no longer on this device
    </Meta>
  );
}
