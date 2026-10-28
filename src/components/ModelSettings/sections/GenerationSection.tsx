import { SpinButton, Subtitle1, Switch, Textarea } from "@fluentui/react-components";
import type { ModelCapabilities } from "../../../types";
import { isRejected, rejectedReason } from "../../../utils/capabilityStatus";
import { thinkingNote } from "../../../utils/modelCapabilities";
import SettingField from "../SettingField/SettingField";
import type { ModelSettingsForm } from "../useModelSettingsForm";
import type { CapabilityMap } from "./types";

interface Props {
  form: ModelSettingsForm;
  caps: CapabilityMap;
  capabilities: ModelCapabilities | null;
}

/** Reply settings: the length cap, the seed, thinking and the grammar. */
export default function GenerationSection({ form, caps, capabilities }: Props) {
  const { settings, update } = form;

  return (
    <section className="model-settings__section">
      <Subtitle1>Generation</Subtitle1>

      <SettingField
        label="Max Tokens"
        info="Longest reply allowed, in tokens. Empty uses the server default of 2048."
        disabledReason={rejectedReason(caps.maxTokens)}
      >
        <SpinButton
          disabled={isRejected(caps.maxTokens)}
          value={settings.maxTokens ?? null}
          placeholder="Unset (no limit)"
          min={256}
          max={32768}
          step={256}
          onChange={(_, data) => {
            // Clearing the field unsets the value so max_tokens is omitted.
            update("maxTokens", data.value ?? undefined);
          }}
        />
      </SettingField>

      <SettingField
        label="Seed"
        info="Fixes the random seed, so the same prompt and settings give the same reply. Empty means random."
        disabledReason={rejectedReason(caps.seed)}
      >
        <SpinButton
          disabled={isRejected(caps.seed)}
          value={settings.seed ?? null}
          placeholder="Random"
          step={1}
          onChange={(_, data) => update("seed", data.value ?? undefined)}
        />
      </SettingField>

      <SettingField
        label="Think Mode"
        info="Lets reasoning models think before they answer. The thinking is shown above the reply."
        note={thinkingNote(capabilities)}
        disabledReason={rejectedReason(caps.thinking)}
      >
        <Switch
          label="Think before answering"
          disabled={isRejected(caps.thinking)}
          checked={settings.think ?? true}
          onChange={(_, data) => update("think", data.checked)}
        />
      </SettingField>

      <SettingField
        label="Grammar"
        info="Constrains the reply to a GBNF grammar, for example to force JSON or a fixed set of answers. Empty means unconstrained."
        disabledReason={rejectedReason(caps.grammarString)}
      >
        <Textarea
          className="model-settings__textarea"
          disabled={isRejected(caps.grammarString)}
          value={settings.grammarString ?? ""}
          onChange={(_, data) => update("grammarString", data.value || undefined)}
          placeholder="Optional GBNF grammar…"
        />
      </SettingField>
    </section>
  );
}
