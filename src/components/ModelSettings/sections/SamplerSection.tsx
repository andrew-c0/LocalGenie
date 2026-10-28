import { Slider, SpinButton, Subtitle1 } from "@fluentui/react-components";
import { isRejected, rejectedReason } from "../../../utils/capabilityStatus";
import { Body } from "../../ui/Typography/Typography";
import SettingField from "../SettingField/SettingField";
import type { ModelSettingsForm } from "../useModelSettingsForm";
import type { CapabilityMap } from "./types";

interface Props {
  form: ModelSettingsForm;
  caps: CapabilityMap;
}

/** Sampling settings: temperature, the top-k and top-p cuts, and the repetition penalties. */
export default function SamplerSection({ form, caps }: Props) {
  const { settings, update } = form;
  const temperature = settings.temperature ?? 0.7;
  const topP = settings.topP ?? 0.9;
  const minP = settings.minP ?? 0.05;

  return (
    <section className="model-settings__section">
      <Subtitle1>Sampler</Subtitle1>

      <SettingField
        label="Temperature"
        info="Randomness. Lower gives more focused replies, higher gives more varied ones."
        disabledReason={rejectedReason(caps.temperature)}
      >
        <div className="model-settings__slider-row">
          <Slider
            className="model-settings__slider"
            disabled={isRejected(caps.temperature)}
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(_, data) => update("temperature", data.value)}
          />
          <Body className="model-settings__slider-value">{temperature.toFixed(1)}</Body>
        </div>
      </SettingField>

      <SettingField
        label="Top P"
        info="Sample only from the smallest set of tokens whose probabilities add up to this value."
        disabledReason={rejectedReason(caps.topP)}
      >
        <div className="model-settings__slider-row">
          <Slider
            className="model-settings__slider"
            disabled={isRejected(caps.topP)}
            min={0}
            max={1}
            step={0.05}
            value={topP}
            onChange={(_, data) => update("topP", data.value)}
          />
          <Body className="model-settings__slider-value">{topP.toFixed(2)}</Body>
        </div>
      </SettingField>

      <SettingField
        label="Top K"
        info="Sample only from the K most likely next tokens. Lower is more focused."
        disabledReason={rejectedReason(caps.topK)}
      >
        <SpinButton
          disabled={isRejected(caps.topK)}
          value={settings.topK ?? 40}
          min={1}
          max={100}
          onChange={(_, data) => {
            if (data.value != null) update("topK", data.value);
          }}
        />
      </SettingField>

      <SettingField
        label="Min P"
        info="Drop tokens whose probability is below this fraction of the most likely token's."
        disabledReason={rejectedReason(caps.minP)}
      >
        <div className="model-settings__slider-row">
          <Slider
            className="model-settings__slider"
            disabled={isRejected(caps.minP)}
            min={0}
            max={1}
            step={0.01}
            value={minP}
            onChange={(_, data) => update("minP", data.value)}
          />
          <Body className="model-settings__slider-value">{minP.toFixed(2)}</Body>
        </div>
      </SettingField>

      <SettingField
        label="Repetition Penalty"
        info="Lowers the chance of repeating tokens already used. 1 means no penalty."
        disabledReason={rejectedReason(caps.repetitionPenalty)}
      >
        <SpinButton
          disabled={isRejected(caps.repetitionPenalty)}
          value={settings.repetitionPenalty ?? 1.1}
          min={1}
          max={2}
          step={0.1}
          onChange={(_, data) => {
            if (data.value != null) update("repetitionPenalty", data.value);
          }}
        />
      </SettingField>

      <SettingField
        label="Presence Penalty"
        info="Lowers the chance of any token that has already appeared, which nudges the reply toward new topics. Empty means unset."
        disabledReason={rejectedReason(caps.presencePenalty)}
      >
        <SpinButton
          disabled={isRejected(caps.presencePenalty)}
          value={settings.presencePenalty ?? null}
          placeholder="Unset"
          min={-2}
          max={2}
          step={0.1}
          onChange={(_, data) => update("presencePenalty", data.value ?? undefined)}
        />
      </SettingField>

      <SettingField
        label="Frequency Penalty"
        info="Lowers the chance of a token in proportion to how often it has appeared. Empty means unset."
        disabledReason={rejectedReason(caps.frequencyPenalty)}
      >
        <SpinButton
          disabled={isRejected(caps.frequencyPenalty)}
          value={settings.frequencyPenalty ?? null}
          placeholder="Unset"
          min={-2}
          max={2}
          step={0.1}
          onChange={(_, data) => update("frequencyPenalty", data.value ?? undefined)}
        />
      </SettingField>
    </section>
  );
}
