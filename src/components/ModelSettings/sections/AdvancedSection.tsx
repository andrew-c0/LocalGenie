import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Dropdown,
  Input,
  Option,
  SpinButton,
  Subtitle2,
} from "@fluentui/react-components";
import type { SettingWarnings } from "../../../utils/modelCapabilities";
import { DEFAULT_LOAD_SETTINGS, SPEC_TYPES } from "../../../utils/modelSettings";
import SettingField from "../SettingField/SettingField";
import type { ModelSettingsForm } from "../useModelSettingsForm";
import type { SettingReasons } from "./types";

interface Props {
  form: ModelSettingsForm;
  reasons: SettingReasons;
  warnings: SettingWarnings;
}

/** llama.cpp-only settings, collapsed by default: GPU layers and speculative decoding. */
export default function AdvancedSection({ form, reasons, warnings }: Props) {
  const { settings, update } = form;

  return (
    <Accordion collapsible>
      <AccordionItem value="advanced">
        <AccordionHeader>Advanced</AccordionHeader>
        <AccordionPanel>
          <div className="model-settings__section">
            <Subtitle2>llama.cpp</Subtitle2>

            <SettingField
              label="GPU Layers"
              info="How many model layers run on the GPU or NPU. -1 offloads all of them."
              disabledReason={reasons.ngl}
              warning={warnings.ngl}
            >
              <SpinButton
                disabled={!!reasons.ngl}
                value={settings.ngl ?? DEFAULT_LOAD_SETTINGS.ngl}
                min={-1}
                max={999}
                onChange={(_, data) => {
                  if (data.value != null) update("ngl", data.value);
                }}
              />
            </SettingField>

            <Subtitle2>Speculative decoding</Subtitle2>

            <SettingField
              label="Speculation Type"
              info="Drafts tokens ahead and checks them in one pass, which can speed up generation. Off uses no speculation."
              disabledReason={reasons.spec}
              warning={warnings.spec}
            >
              <Dropdown
                className="model-settings__full-width"
                disabled={!!reasons.spec}
                value={settings.specType ? settings.specType : "Off"}
                selectedOptions={[settings.specType ?? ""]}
                onOptionSelect={(_, data) => update("specType", data.optionValue || undefined)}
              >
                <Option value="">Off</Option>
                {SPEC_TYPES.map((type) => (
                  <Option key={type} value={type}>
                    {type}
                  </Option>
                ))}
              </Dropdown>
            </SettingField>

            <SettingField
              label="Draft Model"
              info="Model that drafts the tokens for draft-* types. Use a catalogue name (org/repo:precision) or a local GGUF path."
              disabledReason={reasons.draftModel}
              warning={warnings.draftModel}
            >
              <Input
                className="model-settings__full-width"
                disabled={!!reasons.draftModel}
                value={settings.specDraftModel ?? ""}
                onChange={(_, data) => update("specDraftModel", data.value || undefined)}
              />
            </SettingField>

            <SettingField
              label="Draft Tokens"
              info="Most tokens drafted in one step. Empty uses the server default of 3."
              disabledReason={reasons.spec}
            >
              <SpinButton
                disabled={!!reasons.spec}
                value={settings.specNMax ?? null}
                placeholder="Default (3)"
                min={1}
                max={32}
                onChange={(_, data) => update("specNMax", data.value ?? undefined)}
              />
            </SettingField>

            <SettingField
              label="Min Draft Tokens"
              info="Fewest tokens drafted in one step. 0 uses the llama.cpp default."
              disabledReason={reasons.spec}
            >
              <SpinButton
                disabled={!!reasons.spec}
                value={settings.specNMin ?? null}
                placeholder="Default (0)"
                min={0}
                max={32}
                onChange={(_, data) => update("specNMin", data.value ?? undefined)}
              />
            </SettingField>

            <SettingField
              label="Min Draft Probability"
              info="Drafting stops when a token's probability falls below this value. 0 uses the llama.cpp default."
              disabledReason={reasons.spec}
            >
              <SpinButton
                disabled={!!reasons.spec}
                value={settings.specPMin ?? null}
                placeholder="Default (0)"
                min={0}
                max={1}
                step={0.05}
                onChange={(_, data) => update("specPMin", data.value ?? undefined)}
              />
            </SettingField>
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
