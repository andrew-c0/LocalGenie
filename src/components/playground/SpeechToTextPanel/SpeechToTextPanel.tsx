import { Button } from "@fluentui/react-components";
import { useSpeechStore } from "../../../stores/speechStore";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { SHERPA_NAME, SHERPA_RUNTIME_ID, transcribeBlockedReason } from "../../../utils/speech";
import { SPEECH_CPU_NOTE } from "../../../utils/speechText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../ui/Typography/Typography";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { SpeechJobProgress } from "../SpeechJobProgress/SpeechJobProgress";
import { useSpeechJobCancel } from "../SpeechJobProgress/useSpeechJobCancel";
import { SpeechModelColumn } from "../SpeechModels/SpeechModelColumn";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { AudioInput } from "./AudioInput/AudioInput";
import { TranscriptResult } from "./TranscriptResult/TranscriptResult";
import { useTranscription } from "./useTranscription";

/** Speech to text: the model list on the left; the audio input, the running job and the transcript on the right. */
export default function SpeechToTextPanel() {
  const runtime = useRuntimeCheck(SHERPA_RUNTIME_ID);
  const models = useSpeechStore((s) => s.models);
  const selectedModelId = useSpeechStore((s) => s.selectedModelIds.stt);
  const audio = useSpeechStore((s) => s.audio);
  const job = useSpeechStore((s) => s.job);
  const result = useSpeechStore((s) => s.results.stt);
  const { transcribe } = useTranscription();
  const cancel = useSpeechJobCancel();

  const selected = models?.find((m) => m.id === selectedModelId && m.kind === "stt") ?? null;
  const sttJob = job?.kind === "stt" ? job : null;
  const blockedReason = transcribeBlockedReason({
    runtime: runtime.status,
    model: selected,
    audioPath: audio?.audioPath ?? null,
    jobRunning: job !== null,
  });

  return (
    <Flex gap="l" align="start">
      <SpeechModelColumn kind="stt" />

      <Flex direction="column" gap="l" className="flex-grow">
        {runtime.status === "missing" && (
          <RuntimeNotice message={runtimeMissingMessage("Speech to text", SHERPA_NAME)} />
        )}
        {runtime.error && <ErrorBanner message={runtime.error} />}

        <SurfaceCard title="Transcribe">
          <Flex direction="column" gap="m">
            <AudioInput audio={audio} disabled={job !== null} />
            <Flex gap="m" align="center" wrap>
              <Button
                appearance="primary"
                disabled={blockedReason !== null}
                onClick={() => {
                  if (selected && audio) transcribe(selected, audio);
                }}
              >
                Transcribe
              </Button>
              {blockedReason && <Meta>{blockedReason}</Meta>}
            </Flex>
            <Meta>{SPEECH_CPU_NOTE}</Meta>
          </Flex>
        </SurfaceCard>

        {sttJob && <SpeechJobProgress job={sttJob} onCancel={cancel} />}
        {result && <TranscriptResult result={result} />}
      </Flex>
    </Flex>
  );
}
