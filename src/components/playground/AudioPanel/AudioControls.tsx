import { Button } from "@fluentui/react-components";
import { revealAudio } from "../../../services/playground";
import type { AudioTask, EnhanceKind, SpeechResult } from "../../../types";
import { savedPathOf } from "../../../utils/audioTask";
import {
  audioActionLabel,
  ENHANCE_OUTPUT_INFO_LABEL,
  enhanceOutputHelp,
  USE_AS_INPUT_LABEL,
} from "../../../utils/audioText";
import { errorMessage } from "../../../utils/errorMessage";
import { REVEAL_FAILED_TITLE, SHOW_IN_FOLDER_LABEL } from "../../../utils/playgroundText";
import { toast } from "../../../utils/toast";
import { Flex } from "../../ui/Flex/Flex";
import { InfoTooltip } from "../../ui/InfoTooltip/InfoTooltip";
import { BlockedReasonButton } from "../BlockedReasonButton/BlockedReasonButton";
import { AudioResultSummary } from "./AudioResultSummary";

interface AudioControlsProps {
  task: AudioTask;
  enhanceKind: EnhanceKind;
  /** The finished job shown in the stage, or null. */
  result: SpeechResult | null;
  /** Why the primary action is off. Null when it can run. */
  blockedReason: string | null;
  onRun: () => void;
  /** Takes the saved speech as the input audio. Null for the other tasks, which offer it per file. */
  onUseAsInput: ((path: string) => void) | null;
}

/**
 * The controls row at the foot of the Audio card. After a finished job its summary is on the left. On the right: Show in
 * folder and, for speech, Use as input, then the task's primary action, which stays for a re-run.
 */
export function AudioControls({
  task,
  enhanceKind,
  result,
  blockedReason,
  onRun,
  onUseAsInput,
}: AudioControlsProps) {
  const savedPath = savedPathOf(result);

  const reveal = () => {
    if (!savedPath) return;
    revealAudio(savedPath).catch((err: unknown) => {
      toast.error(REVEAL_FAILED_TITLE, errorMessage(err));
    });
  };

  return (
    <Flex gap="m" align="center" justify="between" wrap>
      {result && <AudioResultSummary result={result} savedPath={savedPath} />}
      <Flex gap="s" align="center" wrap>
        {savedPath && (
          <Button appearance="secondary" onClick={reveal}>
            {SHOW_IN_FOLDER_LABEL}
          </Button>
        )}
        {savedPath && onUseAsInput && (
          <Button appearance="secondary" onClick={() => onUseAsInput(savedPath)}>
            {USE_AS_INPUT_LABEL}
          </Button>
        )}
        <BlockedReasonButton
          label={audioActionLabel(task, enhanceKind)}
          blockedReason={blockedReason}
          onClick={onRun}
        />
        {task === "enhance" && (
          <InfoTooltip label={ENHANCE_OUTPUT_INFO_LABEL} help={enhanceOutputHelp(enhanceKind)} />
        )}
      </Flex>
    </Flex>
  );
}
