import { AUDIO_CARD_TITLE, AUDIO_TASK_LABEL, AUDIO_TASK_OPTIONS } from "../../../utils/audioText";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { SHERPA_NAME } from "../../../utils/speech";
import { ChipRow } from "../../ui/ChipRow/ChipRow";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { AudioControls } from "./AudioControls";
import { AudioSettings } from "./AudioSettings";
import { AudioStage } from "./AudioStage";
import { useAudioEntryTask } from "./useAudioEntryTask";
import { useAudioPanel } from "./useAudioPanel";

/**
 * The Audio tool: one card with the task switch in its header, then the stage (the input, the running job, the result),
 * the settings of the task and the controls. The model of the task is picked in the header's selector.
 */
export default function AudioPanel() {
  useAudioEntryTask();
  const panel = useAudioPanel();
  const { task, enhanceKind, job, shownResult } = panel;
  const idle = job === null;

  return (
    <Flex direction="column" gap="l">
      {panel.runtime.status === "missing" && (
        <RuntimeNotice message={runtimeMissingMessage(AUDIO_CARD_TITLE, SHERPA_NAME)} />
      )}
      {panel.runtime.error && <ErrorBanner message={panel.runtime.error} />}

      {panel.models && panel.selected === null && <PickModelHint />}

      <SurfaceCard
        title={AUDIO_CARD_TITLE}
        action={
          <ChipRow
            ariaLabel={AUDIO_TASK_LABEL}
            options={AUDIO_TASK_OPTIONS}
            value={task}
            onChange={panel.setAudioTask}
          />
        }
      >
        <Flex direction="column" gap="m">
          <AudioStage
            task={task}
            audio={panel.audio}
            form={panel.form}
            onFormChange={panel.setForm}
            needsReference={panel.needsReference}
            job={job}
            onCancel={panel.cancel}
            result={shownResult}
            onUseAsInput={panel.takeAsInput}
          />
          {idle && (
            <AudioSettings
              task={task}
              form={panel.form}
              onFormChange={panel.setForm}
              voices={panel.voices}
              voiceId={panel.voiceId}
              needsReference={panel.needsReference}
              enhanceKind={enhanceKind}
              onEnhanceKindChange={panel.setEnhanceKind}
            />
          )}
          {idle && (
            <AudioControls
              task={task}
              enhanceKind={enhanceKind}
              result={shownResult}
              blockedReason={panel.blockedReason}
              onRun={panel.run}
              onUseAsInput={
                task === "speak" ? (path) => panel.takeAsInput(path, "transcribe") : null
              }
            />
          )}
        </Flex>
      </SurfaceCard>
    </Flex>
  );
}
