import { Field, Textarea } from "@fluentui/react-components";
import type { SpeechAudioInput } from "../../../types";
import { SPEAK_TEXT_LABEL, SPEAK_TEXT_PLACEHOLDER } from "../../../utils/audioText";
import { REFERENCE_HINT, REFERENCE_SECTION_TITLE } from "../../../utils/speechText";
import { Flex } from "../../ui/Flex/Flex";
import { AudioInput } from "../AudioInput/AudioInput";

interface SpeakInputProps {
  text: string;
  onTextChange: (text: string) => void;
  /** The model copies a voice from a reference clip, which is the speak input clip. */
  needsReference: boolean;
  audio: SpeechAudioInput | null;
  /** A job runs, so the reference clip cannot change. */
  disabled: boolean;
}

/** The speak task's input: the text to say, and for a voice-copying model the clip to copy the voice from. */
export function SpeakInput({
  text,
  onTextChange,
  needsReference,
  audio,
  disabled,
}: SpeakInputProps) {
  return (
    <Flex direction="column" gap="m">
      <Field label={SPEAK_TEXT_LABEL}>
        <Textarea
          value={text}
          onChange={(_, data) => onTextChange(data.value)}
          resize="vertical"
          rows={4}
          placeholder={SPEAK_TEXT_PLACEHOLDER}
        />
      </Field>
      {needsReference && (
        <Field label={REFERENCE_SECTION_TITLE}>
          <AudioInput task="speak" audio={audio} disabled={disabled} hint={REFERENCE_HINT} />
        </Field>
      )}
    </Flex>
  );
}
