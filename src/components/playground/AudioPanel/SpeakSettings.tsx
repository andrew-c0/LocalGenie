import { Field, Slider } from "@fluentui/react-components";
import type { SpeechVoice } from "../../../types";
import { SPEED_MAX, SPEED_MIN, SPEED_STEP, voiceOptions } from "../../../utils/speech";
import { SPEED_HELP } from "../../../utils/speechText";
import { Flex } from "../../ui/Flex/Flex";
import { HelpLabel } from "../../ui/HelpLabel/HelpLabel";
import { OptionDropdown } from "../../ui/OptionDropdown/OptionDropdown";
import { Body } from "../../ui/Typography/Typography";
import "./SpeakSettings.css";

interface SpeakSettingsProps {
  voices: SpeechVoice[];
  /** The voice in use, or null when the model has none. */
  voiceId: number | null;
  speed: number;
  onVoiceChange: (voiceId: number) => void;
  onSpeedChange: (speed: number) => void;
}

/** The voice and speed of a text to speech model, on one row. The speed is a short slider with its value beside it. */
export function SpeakSettings({
  voices,
  voiceId,
  speed,
  onVoiceChange,
  onSpeedChange,
}: SpeakSettingsProps) {
  return (
    <Flex gap="l" align="start" wrap>
      <div className="speak-settings__voice">
        <OptionDropdown
          label="Voice"
          fullWidth
          options={voiceOptions(voices)}
          value={voiceId === null ? null : String(voiceId)}
          onChange={(value) => onVoiceChange(Number(value))}
          disabled={voiceId === null}
        />
      </div>
      <Field label={<HelpLabel label="Speed" help={SPEED_HELP} />}>
        <Flex gap="s" align="center">
          <div className="speak-settings__speed">
            <Slider
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              value={speed}
              onChange={(_, data) => onSpeedChange(data.value)}
            />
          </div>
          <Body>{speed.toFixed(1)}x</Body>
        </Flex>
      </Field>
    </Flex>
  );
}
