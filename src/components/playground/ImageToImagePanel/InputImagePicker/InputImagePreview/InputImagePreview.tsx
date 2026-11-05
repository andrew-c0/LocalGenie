import { Spinner } from "@fluentui/react-components";
import { useState } from "react";
import { revealAttachment } from "../../../../../services/attachments";
import { readInputImage } from "../../../../../services/playground";
import type { ImageSize, InputImage } from "../../../../../types";
import { errorMessage } from "../../../../../utils/errorMessage";
import { toast } from "../../../../../utils/toast";
import { ErrorBanner } from "../../../../ui/ErrorBanner/ErrorBanner";
import { ImagePreviewDialog } from "../../../../ui/ImagePreviewDialog/ImagePreviewDialog";
import { useSavedDataUrl } from "../../../useSavedDataUrl";
import "./InputImagePreview.css";

interface InputImagePreviewProps {
  input: InputImage;
  /** The picture's pixel size, reported once its preview has loaded. */
  onSourceSize: (size: ImageSize) => void;
  /** Keeps the picture mounted but out of the layout, so it still loads and reports its size. */
  hidden?: boolean;
  /** `large` lets the picture take more height, for a tab that gives the picture its own stage. */
  size?: "standard" | "large";
}

/** The input picture as a preview that opens the picture larger. Used by the picker and by the upscaling stage. */
export function InputImagePreview({
  input,
  onSourceSize,
  hidden = false,
  size = "standard",
}: InputImagePreviewProps) {
  const preview = useSavedDataUrl(input.path, readInputImage, "Could not open the image.");
  const [enlarged, setEnlarged] = useState(false);

  // The size is taken once per picture, so a size the user typed survives leaving and returning to the tab.
  const handlePreviewLoad = (image: HTMLImageElement) => {
    if (input.sourceSize) return;
    onSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
  };

  const revealPicture = () => {
    revealAttachment(input.path).catch((err: unknown) => {
      toast.error(
        "File not available",
        `${input.name} could not be shown: ${errorMessage(err, "Explorer could not open.")}`,
      );
    });
  };

  const pictureClass =
    size === "large"
      ? "input-image-preview__picture input-image-preview__picture--large"
      : "input-image-preview__picture";

  return (
    <div className="input-image-preview" hidden={hidden}>
      {preview.error && <ErrorBanner message={preview.error} />}
      {!preview.error && !preview.dataUrl && <Spinner label="Opening the picture…" />}
      {preview.dataUrl && (
        <>
          {/* A native button, so Enter and Space open the picture without extra key handling. */}
          <button
            type="button"
            className="input-image-preview__button"
            aria-label="Enlarge picture"
            onClick={() => setEnlarged(true)}
          >
            <img
              className={pictureClass}
              src={preview.dataUrl}
              alt="Input"
              onLoad={(event) => handlePreviewLoad(event.currentTarget)}
            />
          </button>
          <ImagePreviewDialog
            open={enlarged}
            title={input.name}
            src={preview.dataUrl}
            onClose={() => setEnlarged(false)}
            onOpenLocation={revealPicture}
          />
        </>
      )}
    </div>
  );
}
