import { Button } from "@fluentui/react-components";
import type { ImageResult, PlaygroundDevice } from "../../../../types";
import { USE_AS_INPUT_LABEL } from "../../../../utils/imageToImageText";
import {
  GENERATE_LABEL,
  GENERATE_RESULT_BAR_COPY,
  GENERATE_TIME_INFO_LABEL,
  MODEL_LOAD_NOTE,
  SHOW_IN_FOLDER_LABEL,
} from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { InfoTooltip } from "../../../ui/InfoTooltip/InfoTooltip";
import { BlockedReasonButton } from "../../BlockedReasonButton/BlockedReasonButton";
import { GenerationResultBar } from "../../ImageGeneration/GenerationResultBar/GenerationResultBar";
import { revealSavedImage } from "../../revealSavedImage";

interface GenerateControlsProps {
  /** The saved result shown for the form, or null. While it is set the row shows it on the left. */
  result: ImageResult | null;
  /** Why Generate is off. Null when it can run. */
  blockedReason: string | null;
  devices: PlaygroundDevice[] | null;
  onGenerate: () => void;
  onUseSeed: (seed: number) => void;
  onUseAsInput: (path: string) => void;
}

/**
 * The controls at the foot of the text to image card. After a result it shows the result summary on the left, and Show
 * in folder and Use this image as input before Generate, which stays for a re-run with changed settings.
 */
export function GenerateControls({
  result,
  blockedReason,
  devices,
  onGenerate,
  onUseSeed,
  onUseAsInput,
}: GenerateControlsProps) {
  const savedPath = result?.path ?? null;

  return (
    <Flex gap="m" align="center" justify="between" wrap>
      {result && (
        <GenerationResultBar
          result={result}
          devices={devices}
          onUseSeed={onUseSeed}
          copy={GENERATE_RESULT_BAR_COPY}
        />
      )}
      <Flex gap="s" align="center" wrap>
        {savedPath && (
          <>
            <Button appearance="secondary" onClick={() => revealSavedImage(savedPath)}>
              {SHOW_IN_FOLDER_LABEL}
            </Button>
            <Button appearance="secondary" onClick={() => onUseAsInput(savedPath)}>
              {USE_AS_INPUT_LABEL}
            </Button>
          </>
        )}
        <InfoTooltip label={GENERATE_TIME_INFO_LABEL} help={MODEL_LOAD_NOTE} />
        <BlockedReasonButton
          label={GENERATE_LABEL}
          blockedReason={blockedReason}
          onClick={onGenerate}
        />
      </Flex>
    </Flex>
  );
}
