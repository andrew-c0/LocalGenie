import { Button, Spinner } from "@fluentui/react-components";
import { ImageRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { revealAttachment } from "../../../../services/attachments";
import { readInputImage } from "../../../../services/playground";
import type { ImageSize, InputImage } from "../../../../types";
import { errorMessage } from "../../../../utils/errorMessage";
import { INPUT_HINT, INPUT_PICK_LABEL } from "../../../../utils/imageToImageText";
import { toast } from "../../../../utils/toast";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { ImagePreviewDialog } from "../../../ui/ImagePreviewDialog/ImagePreviewDialog";
import { Meta } from "../../../ui/Typography/Typography";
import { useSavedDataUrl } from "../../useSavedDataUrl";
import "./InputImagePicker.css";

interface InputImagePickerProps {
  /** The input picture, or null when none is chosen. */
  input: InputImage | null;
  /** Why the file dialog or the picture failed. */
  error: string | null;
  /** A job runs, so the picture cannot change. */
  disabled: boolean;
  /** The line under the button. Defaults to the image to image hint. */
  hint?: string;
  onChoose: () => void;
  /** The picture's pixel size, reported once its preview has loaded. */
  onSourceSize: (size: ImageSize) => void;
}

/** The input picture: the pick button, its file name and a preview that opens the picture larger. */
export function InputImagePicker({
  input,
  error,
  disabled,
  hint = INPUT_HINT,
  onChoose,
  onSourceSize,
}: InputImagePickerProps) {
  const preview = useSavedDataUrl(input?.path ?? null, readInputImage, "Could not open the image.");
  const [enlarged, setEnlarged] = useState(false);

  // The size is taken once per picture, so a size the user typed survives leaving and returning to the tab.
  const handlePreviewLoad = (image: HTMLImageElement) => {
    if (input?.sourceSize) return;
    onSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
  };

  const revealPicture = () => {
    if (!input) return;
    revealAttachment(input.path).catch((err: unknown) => {
      toast.error(
        "File not available",
        `${input.name} could not be shown: ${errorMessage(err, "Explorer could not open.")}`,
      );
    });
  };

  return (
    <Flex direction="column" gap="s">
      <Flex gap="m" align="center" wrap>
        <Button
          appearance="secondary"
          icon={<ImageRegular />}
          onClick={onChoose}
          disabled={disabled}
        >
          {INPUT_PICK_LABEL}
        </Button>
        {input && <Meta>Input: {input.name}</Meta>}
      </Flex>
      <Meta>{hint}</Meta>
      {error && <ErrorBanner message={error} />}
      {preview.error && <ErrorBanner message={preview.error} />}
      {input && !preview.error && !preview.dataUrl && <Spinner label="Opening the picture…" />}
      {input && preview.dataUrl && (
        <>
          {/* A native button, so Enter and Space open the picture without extra key handling. */}
          <button
            type="button"
            className="input-image-picker__preview-button"
            aria-label="Enlarge picture"
            onClick={() => setEnlarged(true)}
          >
            <img
              className="input-image-picker__preview"
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
    </Flex>
  );
}
