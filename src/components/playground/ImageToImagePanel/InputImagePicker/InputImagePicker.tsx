import { Button } from "@fluentui/react-components";
import { ImageRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import type { ImageSize, InputImage } from "../../../../types";
import { INPUT_HINT, INPUT_HINT_LABEL, INPUT_PICK_LABEL } from "../../../../utils/imageToImageText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { InfoTooltip } from "../../../ui/InfoTooltip/InfoTooltip";
import { Meta } from "../../../ui/Typography/Typography";
import { InputImagePreview } from "./InputImagePreview/InputImagePreview";

interface InputImagePickerProps {
  /** The input picture, or null when none is chosen. */
  input: InputImage | null;
  /** Why the file dialog or the picture failed. */
  error: string | null;
  /** A job runs, so the picture cannot change. */
  disabled: boolean;
  /** The line under the button, or the info tooltip's text when `hintInInfo` is set. Defaults to the image to image hint. */
  hint?: string;
  /** Moves the hint into an info icon beside the button, so the row stays compact. */
  hintInInfo?: boolean;
  /** Shows the preview under the hint. A tab that places the preview itself passes false. */
  showPreview?: boolean;
  onChoose: () => void;
  /** The picture's pixel size, reported once its preview has loaded. */
  onSourceSize: (size: ImageSize) => void;
  /** Shows "Input: name" beside the button. A tab that names the picture under the preview passes false. */
  showName?: boolean;
  /** Placed at the right end of the button row, e.g. a tab's primary action. */
  trailing?: ReactNode;
}

/** The input picture: the pick button, its file name and, by default, a preview that opens the picture larger. */
export function InputImagePicker({
  input,
  error,
  disabled,
  hint = INPUT_HINT,
  hintInInfo = false,
  showPreview = true,
  onChoose,
  onSourceSize,
  showName = true,
  trailing,
}: InputImagePickerProps) {
  return (
    <Flex direction="column" gap="s">
      <Flex gap="m" align="center" justify="between" wrap>
        <Flex gap="m" align="center" wrap>
          <Button
            appearance="secondary"
            icon={<ImageRegular />}
            onClick={onChoose}
            disabled={disabled}
          >
            {INPUT_PICK_LABEL}
          </Button>
          {hintInInfo && <InfoTooltip label={INPUT_HINT_LABEL} help={hint} />}
          {showName && input && <Meta>Input: {input.name}</Meta>}
        </Flex>
        {trailing}
      </Flex>
      {!hintInInfo && <Meta>{hint}</Meta>}
      {error && <ErrorBanner message={error} />}
      {showPreview && input && <InputImagePreview input={input} onSourceSize={onSourceSize} />}
    </Flex>
  );
}
