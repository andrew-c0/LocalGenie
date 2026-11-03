import { Dropdown, Option, SpinButton, Subtitle1 } from "@fluentui/react-components";
import { useRamEstimateStore } from "../../../stores/ramEstimateStore";
import type { SettingWarnings } from "../../../utils/modelCapabilities";
import { estimatedRamLabel, type StoredRam } from "../../../utils/modelRam";
import {
  contextWindowFor,
  DEFAULT_CONTEXT_WINDOW,
  POWER_MODES,
} from "../../../utils/modelSettings";
import { spinNumber } from "../../../utils/spinValue";
import { useContextMemory } from "../../shell/SystemUsage/useContextMemory";
import { Body, Meta } from "../../ui/Typography/Typography";
import SettingField from "../SettingField/SettingField";
import type { ModelSettingsForm } from "../useModelSettingsForm";
import type { SettingReasons } from "./types";

/** Upper bound for the context window when the model's own length is not known. */
const MAX_CONTEXT_WINDOW = 131072;
const MIN_CONTEXT_WINDOW = 512;

interface Props {
  form: ModelSettingsForm;
  /** The model shown, with its `:precision` when it has one. */
  modelName: string;
  /** The model's settings key, under which its stored RAM is kept. */
  settingsKey: string;
  reasons: SettingReasons;
  warnings: SettingWarnings;
}

/** Settings sent with every message. A change reloads the model on the next message. */
export default function LoadSection({ form, modelName, settingsKey, reasons, warnings }: Props) {
  const { settings, update, nativeContext } = form;
  const maxContext = nativeContext ?? MAX_CONTEXT_WINDOW;
  // The window in the field, edited or not. It is what the estimate below is for.
  const contextWindow = contextWindowFor(settings, nativeContext) ?? DEFAULT_CONTEXT_WINDOW;
  const stored: StoredRam | undefined = useRamEstimateStore((s) => s.ramByModel[settingsKey]);
  // A fixed window (QAIRT bundle) has no estimate to follow, so the figure is only read when it is editable.
  const editable = !reasons.nctx;
  const kvBytes = useContextMemory(editable ? modelName : null, contextWindow, true);
  const ramLabel = editable ? estimatedRamLabel(stored, kvBytes) : null;

  return (
    <section className="model-settings__section">
      <Subtitle1>Load</Subtitle1>
      <Body className="model-settings__hint">
        Sent with every message. If one of these changes, the model reloads on the next message. The
        compute target (NPU, GPU or CPU) is chosen in the model selector at the top.
      </Body>

      <SettingField
        label="Context Window"
        info="Context length in tokens the server allocates. The default is the model's context length, up to 8K. Larger windows use more memory."
        disabledReason={reasons.nctx}
        warning={warnings.nctx}
      >
        <SpinButton
          disabled={!!reasons.nctx}
          value={contextWindow}
          min={MIN_CONTEXT_WINDOW}
          max={maxContext}
          step={512}
          onChange={(_, data) => {
            const value = spinNumber(data, MIN_CONTEXT_WINDOW, maxContext);
            if (value != null) update("nctx", value);
          }}
        />
      </SettingField>
      {ramLabel && <Meta>{ramLabel}</Meta>}

      <SettingField
        label="Power Mode"
        info="HTP power and clock management. Burst is the server default and gives the highest speed."
      >
        <Dropdown
          className="model-settings__full-width"
          value={settings.powerMode ? settings.powerMode.replaceAll("_", " ") : "Default (burst)"}
          selectedOptions={[settings.powerMode ?? ""]}
          onOptionSelect={(_, data) => update("powerMode", data.optionValue || undefined)}
        >
          <Option value="">Default (burst)</Option>
          {POWER_MODES.map((mode) => (
            <Option key={mode} value={mode}>
              {mode.replaceAll("_", " ")}
            </Option>
          ))}
        </Dropdown>
      </SettingField>
    </section>
  );
}
