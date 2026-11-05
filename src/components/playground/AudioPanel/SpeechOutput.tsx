import type { SpeechResult } from "../../../types";
import {
  SPEAK_FAILED_MESSAGE,
  SPEAK_RESULT_TITLE,
  SPEECH_NOT_SAVED_MESSAGE,
} from "../../../utils/audioText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { AudioWaveformPlayer } from "../AudioWaveformPlayer/AudioWaveformPlayer";
import { AudioResultFrame } from "./AudioResultFrame";

interface SpeechOutputProps {
  result: SpeechResult;
}

/** The last speech synthesis: a player for the saved file. Its folder and time are on the controls row. */
export function SpeechOutput({ result }: SpeechOutputProps) {
  return (
    <AudioResultFrame
      title={SPEAK_RESULT_TITLE}
      result={result}
      failedMessage={SPEAK_FAILED_MESSAGE}
    >
      {result.outputPath ? (
        <AudioWaveformPlayer path={result.outputPath} />
      ) : (
        <ErrorBanner message={SPEECH_NOT_SAVED_MESSAGE} />
      )}
    </AudioResultFrame>
  );
}
