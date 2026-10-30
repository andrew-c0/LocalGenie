import { Button } from "@fluentui/react-components";
import { useSpeechStore } from "../../../stores/speechStore";
import { enhanceJobOf } from "../../../utils/audioEnhance";
import {
  ENHANCE_INPUT_HINT,
  ENHANCE_TASK_OPTIONS,
  enhanceOutputHelp,
} from "../../../utils/audioText";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { audioJobBlockedReason, SHERPA_NAME, SHERPA_RUNTIME_ID } from "../../../utils/speech";
import { SPEECH_CPU_NOTE } from "../../../utils/speechText";
import { ChipRow } from "../../ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Meta } from "../../ui/Typography/Typography";
import { AudioInput } from "../AudioInput/AudioInput";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { SpeechJobProgress } from "../SpeechJobProgress/SpeechJobProgress";
import { useSpeechJobCancel } from "../SpeechJobProgress/useSpeechJobCancel";
import { SpeechModelColumn } from "../SpeechModels/SpeechModelColumn";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { EnhanceResult } from "./EnhanceResult/EnhanceResult";
import { useEnhancement } from "./useEnhancement";

/**
 * Audio to audio: the model list on the left; the task, the audio input, the running job and the saved
 * files on the right. The task picks which kind of model the list shows.
 */
export default function AudioToAudioPanel() {
  const runtime = useRuntimeCheck(SHERPA_RUNTIME_ID);
  const models = useSpeechStore((s) => s.models);
  const enhanceKind = useSpeechStore((s) => s.enhanceKind);
  const setEnhanceKind = useSpeechStore((s) => s.setEnhanceKind);
  const selectedModelId = useSpeechStore((s) => s.selectedModelIds[enhanceKind]);
  const audio = useSpeechStore((s) => s.audio);
  const job = useSpeechStore((s) => s.job);
  const result = useSpeechStore((s) => s.results[enhanceKind]);
  const { enhance } = useEnhancement();
  const cancel = useSpeechJobCancel();

  const selected = models?.find((m) => m.id === selectedModelId && m.kind === enhanceKind) ?? null;
  const runningJob = enhanceJobOf(job);
  const blockedReason = audioJobBlockedReason({
    runtime: runtime.status,
    model: selected,
    audioPath: audio?.audioPath ?? null,
    jobRunning: job !== null,
  });

  return (
    <Flex gap="l" align="start">
      <SpeechModelColumn kind={enhanceKind} />

      <Flex direction="column" gap="l" className="flex-grow">
        <ChipRow
          ariaLabel="Audio to audio task"
          options={ENHANCE_TASK_OPTIONS}
          value={enhanceKind}
          onChange={setEnhanceKind}
        />
        {runtime.status === "missing" && (
          <RuntimeNotice message={runtimeMissingMessage("Audio to audio", SHERPA_NAME)} />
        )}
        {runtime.error && <ErrorBanner message={runtime.error} />}

        <SurfaceCard title="Run">
          <Flex direction="column" gap="m">
            <AudioInput audio={audio} disabled={job !== null} hint={ENHANCE_INPUT_HINT} />
            <Flex gap="m" align="center" wrap>
              <Button
                appearance="primary"
                disabled={blockedReason !== null}
                onClick={() => {
                  if (selected && audio) enhance(selected, audio);
                }}
              >
                Run
              </Button>
              {blockedReason && <Meta>{blockedReason}</Meta>}
            </Flex>
            <Meta>{SPEECH_CPU_NOTE}</Meta>
            <Meta>{enhanceOutputHelp(enhanceKind)}</Meta>
          </Flex>
        </SurfaceCard>

        {runningJob && <SpeechJobProgress job={runningJob} onCancel={cancel} />}
        {result && <EnhanceResult result={result} />}
      </Flex>
    </Flex>
  );
}
