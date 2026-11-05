import { Button } from "@fluentui/react-components";
import { DocumentRegular, MicRegular, StopRegular } from "@fluentui/react-icons";
import type { AudioTask, SpeechAudioInput } from "../../../types";
import { INPUT_LABEL_PREFIX } from "../../../utils/audioText";
import { formatElapsed } from "../../../utils/playground";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import { AudioWaveformPlayer } from "../AudioWaveformPlayer/AudioWaveformPlayer";
import { readInputAudio } from "../AudioWaveformPlayer/readInputAudio";
import { useNow } from "../useNow";
import { useAudioFilePicker } from "./useAudioFilePicker";
import { useMicrophoneRecording } from "./useMicrophoneRecording";

const CLOCK_TICK_MS = 1000;

interface AudioInputProps {
  /** The task whose input this is. A file or recording chosen here becomes that task's input only. */
  task: AudioTask;
  /** The current input, or null when none is chosen. */
  audio: SpeechAudioInput | null;
  /** A job runs, so the input cannot change. */
  disabled: boolean;
  /** What the tab says under the buttons, e.g. how long a longer recording takes. */
  hint: string;
}

/** The speech input: a WAV file from disk, or a recording from the microphone. Each task has its own. */
export function AudioInput({ task, audio, disabled, hint }: AudioInputProps) {
  const picker = useAudioFilePicker(task);
  const recording = useMicrophoneRecording(task);
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
      <Meta>{hint}</Meta>
      {audio && startedAt === null && !recording.isSaving && (
        <AudioWaveformPlayer
          path={audio.audioPath}
          label={`${INPUT_LABEL_PREFIX}${audio.audioName}`}
          read={readInputAudio}
        />
      )}
      {recording.isSaving && <Meta>Saving recording…</Meta>}
      {error && <ErrorBanner message={error} />}
    </Flex>
  );
}
