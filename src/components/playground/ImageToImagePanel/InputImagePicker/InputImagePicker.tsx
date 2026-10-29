import { Button, Spinner } from "@fluentui/react-components";
import { ImageRegular } from "@fluentui/react-icons";
import { readInputImage } from "../../../../services/playground";
import type { ImageSize, InputImage } from "../../../../types";
import { INPUT_HINT, INPUT_PICK_LABEL } from "../../../../utils/imageToImageText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
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
  onChoose: () => void;
  /** The picture's pixel size, reported once its preview has loaded. */
  onSourceSize: (size: ImageSize) => void;
}

/** The input picture: the pick button, its file name and a preview. */
export function InputImagePicker({
  input,
  error,
  disabled,
  onChoose,
  onSourceSize,
}: InputImagePickerProps) {
  const preview = useSavedDataUrl(input?.path ?? null, readInputImage, "Could not open the image.");

  // The size is taken once per picture, so a size the user typed survives leaving and returning to the tab.
  const handlePreviewLoad = (image: HTMLImageElement) => {
    if (input?.sourceSize) return;
    onSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
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
      <Meta>{INPUT_HINT}</Meta>
      {error && <ErrorBanner message={error} />}
      {preview.error && <ErrorBanner message={preview.error} />}
      {input && !preview.error && !preview.dataUrl && <Spinner label="Opening the picture…" />}
      {preview.dataUrl && (
        <img
          className="input-image-picker__preview"
          src={preview.dataUrl}
          alt="Input image"
          onLoad={(event) => handlePreviewLoad(event.currentTarget)}
        />
      )}
    </Flex>
  );
}
