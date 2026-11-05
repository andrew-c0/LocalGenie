import type { ImageResult, ImageSize, InputImage, PlaygroundDevice } from "../../../../types";
import {
  EDIT_TIME_INFO_LABEL,
  EDIT_TIME_NOTE,
  INPUT_HINT,
} from "../../../../utils/imageToImageText";
import { GENERATE_LABEL } from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { InfoTooltip } from "../../../ui/InfoTooltip/InfoTooltip";
import { BlockedReasonButton } from "../../BlockedReasonButton/BlockedReasonButton";
import { InputImagePicker } from "../InputImagePicker/InputImagePicker";
import { EditResultControls } from "./EditResultControls";

interface EditControlsProps {
  input: InputImage | null;
  /** Why the picker's file dialog or the picture failed. */
  pickerError: string | null;
  /** A job runs, so the picture cannot change and Generate waits. */
  jobRunning: boolean;
  /** Why Generate is off. Null when it can run. */
  blockedReason: string | null;
  /** The successful result shown for the picture on the form, or null. While it is set the row shows the result. */
  result: ImageResult | null;
  devices: PlaygroundDevice[] | null;
  onChoose: () => void;
  onSourceSize: (size: ImageSize) => void;
  onGenerate: () => void;
  onUseAsInput: (path: string) => void;
  onUseSeed: (seed: number) => void;
  onClear: () => void;
}

/**
 * The controls at the foot of the card. Before a result: the picture button on the left, and Generate on the right.
 * After a successful result: the result row (see EditResultControls).
 */
export function EditControls({
  input,
  pickerError,
  jobRunning,
  blockedReason,
  result,
  devices,
  onChoose,
  onSourceSize,
  onGenerate,
  onUseAsInput,
  onUseSeed,
  onClear,
}: EditControlsProps) {
  if (result?.path) {
    return (
      <EditResultControls
        result={result}
        path={result.path}
        devices={devices}
        onUseAsInput={onUseAsInput}
        onUseSeed={onUseSeed}
        onClear={onClear}
      />
    );
  }

  return (
    <InputImagePicker
      input={input}
      error={pickerError}
      disabled={jobRunning}
      hint={INPUT_HINT}
      hintInInfo
      showPreview={false}
      showName={false}
      onChoose={onChoose}
      onSourceSize={onSourceSize}
      trailing={
        <Flex gap="s" align="center" wrap>
          <InfoTooltip label={EDIT_TIME_INFO_LABEL} help={EDIT_TIME_NOTE} />
          <BlockedReasonButton
            label={GENERATE_LABEL}
            blockedReason={blockedReason}
            onClick={onGenerate}
          />
        </Flex>
      }
    />
  );
}
