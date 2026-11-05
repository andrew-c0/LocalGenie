import { Spinner } from "@fluentui/react-components";
import { useState } from "react";
import type { ImageSize } from "../../../types";
import { OPENING_IMAGE_MESSAGE } from "../../../utils/playgroundText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { ImagePreviewDialog } from "../../ui/ImagePreviewDialog/ImagePreviewDialog";

interface ResultPictureProps {
  /** The file name, shown in the enlarged view's title. */
  title: string;
  /** The result picture as a data URL, or null while it loads. */
  dataUrl: string | null;
  error: string | null;
  alt: string;
  enlargeLabel: string;
  onOpenLocation: () => void;
  /** The picture's pixel size once it has loaded, so the comparison can open at the same shape. */
  onSize: (size: ImageSize) => void;
}

/**
 * The result picture at the stage width. It is a native button, so Enter and Space open it larger; it shows a spinner
 * while it loads or the reason it cannot be shown.
 */
export function ResultPicture({
  title,
  dataUrl,
  error,
  alt,
  enlargeLabel,
  onOpenLocation,
  onSize,
}: ResultPictureProps) {
  const [enlarged, setEnlarged] = useState(false);

  if (error) return <ErrorBanner message={error} />;
  if (!dataUrl) return <Spinner label={OPENING_IMAGE_MESSAGE} />;

  return (
    <>
      <button
        type="button"
        className="result-picture__button"
        aria-label={enlargeLabel}
        onClick={() => setEnlarged(true)}
      >
        <img
          className="result-picture__image"
          src={dataUrl}
          alt={alt}
          onLoad={(event) =>
            onSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />
      </button>
      <ImagePreviewDialog
        open={enlarged}
        title={title}
        src={dataUrl}
        onClose={() => setEnlarged(false)}
        onOpenLocation={onOpenLocation}
      />
    </>
  );
}
