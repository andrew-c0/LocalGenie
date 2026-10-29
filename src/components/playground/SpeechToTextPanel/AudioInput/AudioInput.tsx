import { Button } from "@fluentui/react-components";
import { DocumentRegular, MicRegular, StopRegular } from "@fluentui/react-icons";
import type { SpeechAudioInput } from "../../../../types";
import { formatElapsed } from "../../../../utils/playground";
import { AUDIO_INPUT_HINT } from "../../../../utils/speechText";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../../ui/Flex/Flex";
import { Meta } from "../../../ui/Typography/Typography";
import { useNow } from "../../useNow";
import { useAudioFilePicker } from "./useAudioFilePicker";
import { useMicrophoneRecording } from "./useMicrophoneRecording";

const CLOCK_TICK_MS = 1000;

interface AudioInputProps {
  /** The current input, or null when none is chosen. */
  audio: SpeechAudioInput | null;
  /** A job runs, so the input cannot change. */
  disabled: boolean;
}

/** The speech to text input: a WAV file from disk, or a recording from the microphone. */
export function AudioInput({ audio, disabled }: AudioInputProps) {
  const picker = useAudioFilePicker();
  const recording = useMicrophoneRecording();
  const now = useNow(CLOCK_TICK_MS);
  const startedAt = recording.startedAt;
  const isBusy = disabled || startedAt !== null || recording.isSaving;
  const error = picker.error ?? recording.error;

  return (
    <Flex direction="column" gap="s">
      <Flex gap="s" align="center" wrap>
        <Button
          appearance="secondary"
          icon={<DocumentRegular />}
          onClick={picker.chooseFile}
          disabled={isBusy}
        >
          Choose .wav file
        </Button>
        {startedAt !== null ? (
          <Button appearance="secondary" icon={<StopRegular />} onClick={recording.stopRecording}>
            Stop ({formatElapsed(now - startedAt)})
          </Button>
        ) : (
          <Button
            appearance="secondary"
            icon={<MicRegular />}
            onClick={recording.startRecording}
            disabled={isBusy}
          >
            Record
          </Button>
        )}
      </Flex>
      <Meta>{AUDIO_INPUT_HINT}</Meta>
      {audio && <Meta>Input: {audio.audioName}</Meta>}
      {recording.isSaving && <Meta>Saving recording…</Meta>}
      {error && <ErrorBanner message={error} />}
    </Flex>
  );
}
