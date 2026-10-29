import { Button, Field, Slider, Textarea } from "@fluentui/react-components";
import { useSpeechStore } from "../../../stores/speechStore";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import {
  resolveVoiceId,
  SHERPA_NAME,
  SHERPA_RUNTIME_ID,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  synthesizeBlockedReason,
  voiceOptions,
} from "../../../utils/speech";
import { SPEECH_CPU_NOTE, SPEED_HELP } from "../../../utils/speechText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { HelpLabel } from "../../ui/HelpLabel/HelpLabel";
import { OptionDropdown } from "../../ui/OptionDropdown/OptionDropdown";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../ui/Typography/Typography";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { SpeechJobProgress } from "../SpeechJobProgress/SpeechJobProgress";
import { useSpeechJobCancel } from "../SpeechJobProgress/useSpeechJobCancel";
import { SpeechModelColumn } from "../SpeechModels/SpeechModelColumn";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { SpeechOutput } from "./SpeechOutput/SpeechOutput";
import { useSynthesis } from "./useSynthesis";

/** Text to speech: the model list on the left; the text, voice and speed, the running job and the speech on the right. */
export default function TextToSpeechPanel() {
  const runtime = useRuntimeCheck(SHERPA_RUNTIME_ID);
  const models = useSpeechStore((s) => s.models);
  const selectedModelId = useSpeechStore((s) => s.selectedModelIds.tts);
  const form = useSpeechStore((s) => s.form);
  const setForm = useSpeechStore((s) => s.setForm);
  const job = useSpeechStore((s) => s.job);
  const result = useSpeechStore((s) => s.results.tts);
  const { synthesize } = useSynthesis();
  const cancel = useSpeechJobCancel();

  const selected = models?.find((m) => m.id === selectedModelId && m.kind === "tts") ?? null;
  const voices = selected?.voices ?? [];
  const voiceId = resolveVoiceId(form.voiceId, voices);
  const ttsJob = job?.kind === "tts" ? job : null;
  const blockedReason = synthesizeBlockedReason({
    runtime: runtime.status,
    model: selected,
    text: form.text,
    voiceId,
    jobRunning: job !== null,
  });

  return (
    <Flex gap="l" align="start">
      <SpeechModelColumn kind="tts" />

      <Flex direction="column" gap="l" className="flex-grow">
        {runtime.status === "missing" && (
          <RuntimeNotice message={runtimeMissingMessage("Text to speech", SHERPA_NAME)} />
        )}
        {runtime.error && <ErrorBanner message={runtime.error} />}

        <SurfaceCard title="Speak">
          <Flex direction="column" gap="m">
            <Field label="Text">
              <Textarea
                value={form.text}
                onChange={(_, data) => setForm({ text: data.value })}
                resize="vertical"
                rows={4}
                placeholder="Type what the voice should say"
              />
            </Field>

            <OptionDropdown
              label="Voice"
              fullWidth
              options={voiceOptions(voices)}
              value={voiceId === null ? null : String(voiceId)}
              onChange={(value) => setForm({ voiceId: Number(value) })}
              disabled={voiceId === null}
            />

            <Field label={<HelpLabel label="Speed" help={SPEED_HELP} />}>
              <Flex gap="m" align="center">
                <div className="flex-grow">
                  <Slider
                    min={SPEED_MIN}
                    max={SPEED_MAX}
                    step={SPEED_STEP}
                    value={form.speed}
                    onChange={(_, data) => setForm({ speed: data.value })}
                  />
                </div>
                <Body>{form.speed.toFixed(1)}x</Body>
              </Flex>
            </Field>

            <Flex gap="m" align="center" wrap>
              <Button
                appearance="primary"
                disabled={blockedReason !== null}
                onClick={() => {
                  if (selected && voiceId !== null) synthesize(selected, form, voiceId);
                }}
              >
                Generate
              </Button>
              {blockedReason && <Meta>{blockedReason}</Meta>}
            </Flex>
            <Meta>{SPEECH_CPU_NOTE}</Meta>
          </Flex>
        </SurfaceCard>

        {ttsJob && <SpeechJobProgress job={ttsJob} onCancel={cancel} />}
        {result && <SpeechOutput result={result} />}
      </Flex>
    </Flex>
  );
}
