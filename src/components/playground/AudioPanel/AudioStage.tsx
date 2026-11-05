import type {
  AudioTask,
  SpeechAudioInput,
  SpeechForm,
  SpeechJob,
  SpeechResult,
} from "../../../types";
import { ENHANCE_INPUT_HINT } from "../../../utils/audioText";
import { AUDIO_INPUT_HINT } from "../../../utils/speechText";
import { Flex } from "../../ui/Flex/Flex";
import { AudioInput } from "../AudioInput/AudioInput";
import { SpeechJobProgress } from "../SpeechJobProgress/SpeechJobProgress";
import { EnhanceResult } from "./EnhanceResult";
import { SpeakInput } from "./SpeakInput";
import { SpeechOutput } from "./SpeechOutput";
import { TranscriptResult } from "./TranscriptResult";

interface AudioStageProps {
  task: AudioTask;
  audio: SpeechAudioInput | null;
  form: SpeechForm;
  onFormChange: (patch: Partial<SpeechForm>) => void;
  needsReference: boolean;
  /** The running job of any task, or null. */
  job: SpeechJob | null;
  onCancel: () => void;
  /** The finished job of the task's kind. Null while a job runs. */
  result: SpeechResult | null;
  /** Takes a saved file as the input audio, and switches to the task given. */
  onUseAsInput: (path: string, next: AudioTask) => void;
}

/**
 * The Audio stage, top to bottom: the task's input, the running job (no card, centred), then the task's finished
 * result. The input stays on screen while a job runs, but cannot change.
 */
export function AudioStage({
  task,
  audio,
  form,
  onFormChange,
  needsReference,
  job,
  onCancel,
  result,
  onUseAsInput,
}: AudioStageProps) {
  const busy = job !== null;

  return (
    <Flex direction="column" gap="l">
      {task === "speak" ? (
        <SpeakInput
          text={form.text}
          onTextChange={(text) => onFormChange({ text })}
          needsReference={needsReference}
          audio={audio}
          disabled={busy}
        />
      ) : (
        <AudioInput
          task={task}
          audio={audio}
          disabled={busy}
          hint={task === "transcribe" ? AUDIO_INPUT_HINT : ENHANCE_INPUT_HINT}
        />
      )}
      {job && <SpeechJobProgress job={job} onCancel={onCancel} />}
      {result && task === "transcribe" && <TranscriptResult result={result} />}
      {result && task === "speak" && <SpeechOutput result={result} />}
      {result && task === "enhance" && (
        <EnhanceResult result={result} onUseAsInput={(path) => onUseAsInput(path, "enhance")} />
      )}
    </Flex>
  );
}
