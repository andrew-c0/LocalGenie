import { Dropdown, Option, SpinButton, Subtitle1 } from "@fluentui/react-components";
import type { SettingWarnings } from "../../../utils/modelCapabilities";
import { DEFAULT_CONTEXT_WINDOW, POWER_MODES } from "../../../utils/modelSettings";
import { spinNumber } from "../../../utils/spinValue";
import { Body } from "../../ui/Typography/Typography";
import SettingField from "../SettingField/SettingField";
import type { ModelSettingsForm } from "../useModelSettingsForm";
import type { SettingReasons } from "./types";

/** Upper bound for the context window when the model's own length is not known. */
const MAX_CONTEXT_WINDOW = 131072;
const MIN_CONTEXT_WINDOW = 512;

interface Props {
  form: ModelSettingsForm;
  reasons: SettingReasons;
  warnings: SettingWarnings;
}

/** Settings sent with every message. A change reloads the model on the next message. */
export default function LoadSection({ form, reasons, warnings }: Props) {
  const { settings, update, nativeContext } = form;
  const maxContext = nativeContext ?? MAX_CONTEXT_WINDOW;

  return (
    <section className="model-settings__section">
      <Subtitle1>Load</Subtitle1>
      <Body className="model-settings__hint">
        Sent with every message. If one of these changes, the model reloads on the next message. The
        compute target (NPU, GPU or CPU) is chosen in the model selector at the top.
      </Body>

      <SettingField
        label="Context Window"
        info="Context length in tokens the server allocates. Larger windows use more memory."
        disabledReason={reasons.nctx}
        warning={warnings.nctx}
      >
        <SpinButton
          disabled={!!reasons.nctx}
          value={settings.nctx ?? nativeContext ?? DEFAULT_CONTEXT_WINDOW}
          min={MIN_CONTEXT_WINDOW}
          max={maxContext}
          step={512}
          onChange={(_, data) => {
            const value = spinNumber(data, MIN_CONTEXT_WINDOW, maxContext);
            if (value != null) update("nctx", value);
          }}
        />
      </SettingField>

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
