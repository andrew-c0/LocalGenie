import { Dropdown, Option, SpinButton, Subtitle1 } from "@fluentui/react-components";
import type { SettingWarnings } from "../../../utils/modelCapabilities";
import { DEFAULT_CONTEXT_WINDOW, POWER_MODES } from "../../../utils/modelSettings";
import { Body } from "../../ui/Typography/Typography";
import SettingField from "../SettingField/SettingField";
import type { ModelSettingsForm } from "../useModelSettingsForm";
import type { SettingReasons } from "./types";

/** Upper bound for the context window when the model's own length is not known. */
const MAX_CONTEXT_WINDOW = 131072;

interface Props {
  form: ModelSettingsForm;
  /** The compute the model will use: the model's own choice, else the header's. */
  compute: string;
  reasons: SettingReasons;
  warnings: SettingWarnings;
}

/** Settings sent with every message. A change reloads the model on the next message. */
export default function LoadSection({ form, compute, reasons, warnings }: Props) {
  const { settings, update, nativeContext } = form;

  return (
    <section className="model-settings__section">
      <Subtitle1>Load</Subtitle1>
      <Body className="model-settings__hint">
        Sent with every message. If one of these changes, the model reloads on the next message.
      </Body>

      <SettingField
        label="Compute"
        info="Where the model runs: NPU, GPU or CPU. Empty uses the header choice."
        disabledReason={reasons.compute}
        warning={warnings.compute}
      >
        <Dropdown
          className="model-settings__full-width"
          disabled={!!reasons.compute}
          value={compute.toUpperCase()}
          selectedOptions={[compute]}
          onOptionSelect={(_, data) => {
            if (data.optionValue) update("compute", data.optionValue);
          }}
        >
          <Option value="npu">NPU</Option>
          <Option value="gpu">GPU</Option>
          <Option value="cpu">CPU</Option>
        </Dropdown>
      </SettingField>

      <SettingField
        label="Context Window"
        info="Context length in tokens the server allocates. Larger windows use more memory."
        disabledReason={reasons.nctx}
        warning={warnings.nctx}
      >
        <SpinButton
          disabled={!!reasons.nctx}
          value={settings.nctx ?? nativeContext ?? DEFAULT_CONTEXT_WINDOW}
          min={512}
          max={nativeContext ?? MAX_CONTEXT_WINDOW}
          step={512}
          onChange={(_, data) => {
            if (data.value != null) update("nctx", data.value);
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
