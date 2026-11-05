import type { ImageForm, ImageModel } from "../../../../types";
import { editPromptLabel } from "../../../../utils/imageToImage";
import {
  PROMPT_PLACEHOLDER_INIT,
  PROMPT_PLACEHOLDER_REFERENCE,
} from "../../../../utils/imageToImageText";
import { Flex } from "../../../ui/Flex/Flex";
import { AdvancedSettings } from "../../ImageGeneration/AdvancedSettings/AdvancedSettings";
import { PromptField } from "../../ImageGeneration/PromptField/PromptField";
import { StrengthField } from "./StrengthField";
import "./EditSettings.css";

const PROMPT_ROWS = 3;

interface EditSettingsProps {
  form: ImageForm;
  /** The selected model. Its kind decides the prompt wording and whether the strength shows. */
  model: ImageModel | null;
  strength: number;
  onChange: (patch: Partial<ImageForm>) => void;
  onStrengthChange: (strength: number) => void;
}

/**
 * The edit settings below the picture: the prompt, then the shared advanced settings. For a re-draw model the strength
 * joins the settings row. The parent hides all of it while a job runs or a result shows.
 */
export function EditSettings({
  form,
  model,
  strength,
  onChange,
  onStrengthChange,
}: EditSettingsProps) {
  const kind = model?.imageInput ?? null;

  return (
    <Flex direction="column" gap="m">
      <PromptField
        label={editPromptLabel(kind)}
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
        rows={PROMPT_ROWS}
        placeholder={kind === "reference" ? PROMPT_PLACEHOLDER_REFERENCE : PROMPT_PLACEHOLDER_INIT}
      />
      <AdvancedSettings
        form={form}
        model={model}
        onChange={onChange}
        extra={
          kind === "init" && (
            <div className="edit-settings__strength">
              <StrengthField value={strength} onChange={onStrengthChange} />
            </div>
          )
        }
      />
    </Flex>
  );
}
