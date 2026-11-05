import { Button } from "@fluentui/react-components";
import type { ImageResult, PlaygroundDevice } from "../../../../types";
import {
  CLEAR_INPUT_LABEL,
  EDIT_BAR_COPY,
  USE_AS_INPUT_LABEL,
} from "../../../../utils/imageToImageText";
import { SHOW_IN_FOLDER_LABEL } from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { GenerationResultBar } from "../../ImageGeneration/GenerationResultBar/GenerationResultBar";
import { revealSavedImage } from "../../revealSavedImage";

interface EditResultControlsProps {
  result: ImageResult;
  /** The saved picture of the result. */
  path: string;
  devices: PlaygroundDevice[] | null;
  onUseAsInput: (path: string) => void;
  onUseSeed: (seed: number) => void;
  onClear: () => void;
}

/**
 * The controls row after a successful edit: the result summary on the left, and on the right Show in folder, Use this
 * image as input and Clear, which returns the tab to its first step.
 */
export function EditResultControls({
  result,
  path,
  devices,
  onUseAsInput,
  onUseSeed,
  onClear,
}: EditResultControlsProps) {
  return (
    <Flex gap="m" align="center" justify="between" wrap>
      <GenerationResultBar
        result={result}
        devices={devices}
        onUseSeed={onUseSeed}
        copy={EDIT_BAR_COPY}
      />
      <Flex gap="s" align="center" wrap>
        <Button appearance="secondary" onClick={() => revealSavedImage(path)}>
          {SHOW_IN_FOLDER_LABEL}
        </Button>
        <Button appearance="secondary" onClick={() => onUseAsInput(path)}>
          {USE_AS_INPUT_LABEL}
        </Button>
        <Button appearance="secondary" onClick={onClear}>
          {CLEAR_INPUT_LABEL}
        </Button>
      </Flex>
    </Flex>
  );
}
