import { Subtitle1 } from "@fluentui/react-components";
import { DEFAULT_CONTEXT_WINDOW } from "../../../utils/modelSettings";
import SettingField from "../SettingField/SettingField";
import SystemPromptEditor from "../SystemPromptEditor/SystemPromptEditor";
import type { ModelSettingsForm } from "../useModelSettingsForm";

interface Props {
  form: ModelSettingsForm;
}

/** The system prompt blocks sent before every conversation. */
export default function SystemPromptSection({ form }: Props) {
  const { settings, update, nativeContext } = form;

  return (
    <section className="model-settings__section">
      <Subtitle1>System Prompt</Subtitle1>
      <SettingField
        label="System Prompt"
        info="Instructions sent before every conversation. Add text, the current date and time, platform details, or a .txt or .md file read on every send."
      >
        <SystemPromptEditor
          blocks={settings.systemBlocks ?? []}
          onChange={(blocks) => update("systemBlocks", blocks)}
          contextWindow={settings.nctx ?? nativeContext ?? DEFAULT_CONTEXT_WINDOW}
        />
      </SettingField>
    </section>
  );
}
