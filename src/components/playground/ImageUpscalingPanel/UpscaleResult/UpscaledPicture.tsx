import { Spinner } from "@fluentui/react-components";
import { useState } from "react";
import type { ImageSize } from "../../../../types";
import {
  UPSCALE_ENLARGE_LABEL,
  UPSCALE_OPENING_MESSAGE,
  UPSCALE_OUTPUT_ALT,
} from "../../../../utils/upscaleText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { ImagePreviewDialog } from "../../../ui/ImagePreviewDialog/ImagePreviewDialog";

interface UpscaledPictureProps {
  /** The file name, shown in the enlarged view's title. */
  title: string;
  /** The upscaled picture as a data URL, or null while it loads. */
  dataUrl: string | null;
  error: string | null;
  onOpenLocation: () => void;
  /** The picture's pixel size once it has loaded, so the comparison can open at the same shape. */
  onSize: (size: ImageSize) => void;
}

/**
 * The upscaled picture at the stage width. It is a native button, so Enter and Space open it larger; it shows a
 * spinner while it loads or the reason it cannot be shown.
 */
export function UpscaledPicture({
  title,
  dataUrl,
  error,
  onOpenLocation,
  onSize,
}: UpscaledPictureProps) {
  const [enlarged, setEnlarged] = useState(false);

  if (error) return <ErrorBanner message={error} />;
  if (!dataUrl) return <Spinner label={UPSCALE_OPENING_MESSAGE} />;

  return (
    <>
      <button
        type="button"
        className="upscale-result__picture-button"
        aria-label={UPSCALE_ENLARGE_LABEL}
        onClick={() => setEnlarged(true)}
      >
        <img
          className="upscale-result__picture"
          src={dataUrl}
          alt={UPSCALE_OUTPUT_ALT}
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
