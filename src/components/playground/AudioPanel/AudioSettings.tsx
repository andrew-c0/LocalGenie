import type { AudioTask, EnhanceKind, SpeechForm, SpeechVoice } from "../../../types";
import { Flex } from "../../ui/Flex/Flex";
import { EnhanceSettings } from "./EnhanceSettings";
import { SpeakSettings } from "./SpeakSettings";

interface AudioSettingsProps {
  task: AudioTask;
  form: SpeechForm;
  onFormChange: (patch: Partial<SpeechForm>) => void;
  /** The speaking model's voices, for the speak task. */
  voices: SpeechVoice[];
  /** The voice in use, resolved from the form. */
  voiceId: number | null;
  /** A model that copies a voice hides the voice and speed fields: its reference clip is the input. */
  needsReference: boolean;
  enhanceKind: EnhanceKind;
  onEnhanceKindChange: (kind: EnhanceKind) => void;
}

/**
 * The settings under the Audio stage, for the current task: the voice and speed for speak, the clean up or split choice
 * for enhance, and nothing for transcribe.
 */
export function AudioSettings({
  task,
  form,
  onFormChange,
  voices,
  voiceId,
  needsReference,
  enhanceKind,
  onEnhanceKindChange,
}: AudioSettingsProps) {
  const showSpeak = task === "speak" && !needsReference;
  // Nothing to show (transcribe, or a voice-cloning model): render nothing, so the card's row gap does not leave a hole.
  if (!showSpeak && task !== "enhance") return null;

  return (
    <Flex direction="column" gap="m">
      {showSpeak && (
        <SpeakSettings
          voices={voices}
          voiceId={voiceId}
          speed={form.speed}
          onVoiceChange={(id) => onFormChange({ voiceId: id })}
          onSpeedChange={(speed) => onFormChange({ speed })}
        />
      )}
      {task === "enhance" && <EnhanceSettings value={enhanceKind} onChange={onEnhanceKindChange} />}
    </Flex>
  );
}
