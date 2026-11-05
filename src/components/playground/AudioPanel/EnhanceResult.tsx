import type { SpeechResult } from "../../../types";
import {
  ENHANCE_FAILED_MESSAGE,
  ENHANCE_RESULT_TITLE,
  NO_ENHANCE_OUTPUT_MESSAGE,
} from "../../../utils/audioText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { AudioOutputPlayer } from "./AudioOutputPlayer";
import { AudioResultFrame } from "./AudioResultFrame";

interface EnhanceResultProps {
  result: SpeechResult;
  /** Takes one of the saved files as the input audio. */
  onUseAsInput: (path: string) => void;
}

/** The last clean up or split: one labelled player per saved file. */
export function EnhanceResult({ result, onUseAsInput }: EnhanceResultProps) {
  return (
    <AudioResultFrame
      title={ENHANCE_RESULT_TITLE}
      result={result}
      failedMessage={ENHANCE_FAILED_MESSAGE}
    >
      <Flex direction="column" gap="l">
        {result.outputs.length === 0 && <ErrorBanner message={NO_ENHANCE_OUTPUT_MESSAGE} />}
        {result.outputs.map((output) => (
          <AudioOutputPlayer key={output.path} output={output} onUseAsInput={onUseAsInput} />
        ))}
      </Flex>
    </AudioResultFrame>
  );
}
