import { Button } from "@fluentui/react-components";
import type { ImageResult, ImageSize, InputImage } from "../../../types";
import { SHOW_IN_FOLDER_LABEL } from "../../../utils/playgroundText";
import {
  UPSCALE_ACTION_LABEL,
  UPSCALE_CLEAR_LABEL,
  UPSCALE_INPUT_HINT,
} from "../../../utils/upscaleText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { BlockedReasonButton } from "../BlockedReasonButton/BlockedReasonButton";
import { InputImagePicker } from "../ImageToImagePanel/InputImagePicker/InputImagePicker";
import { revealSavedImage } from "../revealSavedImage";
import { UpscaleResultBar } from "./UpscaleResultBar";

interface UpscaleFormProps {
  input: InputImage | null;
  /** Why the picker's file dialog failed. */
  pickerError: string | null;
  /** A job runs, so the picture cannot change. */
  jobRunning: boolean;
  sizeWarning: string | null;
  blockedReason: string | null;
  onChoose: () => void;
  onSourceSize: (size: ImageSize) => void;
  onUpscale: () => void;
  /** The saved result of the picture on the form. While it is set the row shows it instead of the picker. */
  upscaled: ImageResult | null;
  onClear: () => void;
}

/**
 * The controls at the foot of the card. Before an upscale: the picture button with its info icon and Upscale, and
 * the size warning under them. After one: the time and the saved path on the left, Show in folder and Clear on the
 * right. The preview is in the stage above, not here.
 */
export function UpscaleForm({
  input,
  pickerError,
  jobRunning,
  sizeWarning,
  blockedReason,
  onChoose,
  onSourceSize,
  onUpscale,
  upscaled,
  onClear,
}: UpscaleFormProps) {
  if (upscaled) {
    const path = upscaled.path;
    return (
      <Flex gap="m" align="center" justify="between" wrap>
        <UpscaleResultBar result={upscaled} />
        <Flex gap="s" align="center">
          {path && (
            <Button appearance="secondary" onClick={() => revealSavedImage(path)}>
              {SHOW_IN_FOLDER_LABEL}
            </Button>
          )}
          <Button appearance="secondary" onClick={onClear}>
            {UPSCALE_CLEAR_LABEL}
          </Button>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="s">
      <InputImagePicker
        input={input}
        error={pickerError}
        disabled={jobRunning}
        hint={UPSCALE_INPUT_HINT}
        hintInInfo
        showPreview={false}
        showName={false}
        onChoose={onChoose}
        onSourceSize={onSourceSize}
        trailing={
          <BlockedReasonButton
            label={UPSCALE_ACTION_LABEL}
            blockedReason={blockedReason}
            onClick={onUpscale}
          />
        }
      />
      {sizeWarning && <ErrorBanner message={sizeWarning} />}
    </Flex>
  );
}
