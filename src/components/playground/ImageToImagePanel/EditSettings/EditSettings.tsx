import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
} from "@fluentui/react-components";
import type { ImageForm, ImageModel } from "../../../../types";
import { editPromptLabel } from "../../../../utils/imageToImage";
import {
  EDIT_ADVANCED_LABEL,
  PROMPT_PLACEHOLDER_INIT,
  PROMPT_PLACEHOLDER_REFERENCE,
} from "../../../../utils/imageToImageText";
import { Flex } from "../../../ui/Flex/Flex";
import { NegativePromptField } from "../../ImageGeneration/ImageSettingsFields/NegativePromptField";
import { SeedFields } from "../../ImageGeneration/ImageSettingsFields/SeedFields";
import { StepsCfgFields } from "../../ImageGeneration/ImageSettingsFields/StepsCfgFields";
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
 * The edit settings below the picture: the prompt, and an accordion (closed at first) with the rest: for a re-draw
 * model the negative prompt, then one row with steps, CFG scale, seed and the strength. The parent hides all of it while a job
 * runs or a result shows.
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
      <Accordion collapsible>
        <AccordionItem value="advanced">
          <AccordionHeader>{EDIT_ADVANCED_LABEL}</AccordionHeader>
          <AccordionPanel>
            <Flex direction="column" gap="m">
              <NegativePromptField
                value={form.negativePrompt}
                model={model}
                onChange={(negativePrompt) => onChange({ negativePrompt })}
              />
              <Flex gap="m" wrap align="start">
                <StepsCfgFields form={form} model={model} onChange={onChange} />
                <SeedFields form={form} onChange={onChange} />
                {kind === "init" && (
                  <div className="edit-settings__strength">
                    <StrengthField value={strength} onChange={onStrengthChange} />
                  </div>
                )}
              </Flex>
            </Flex>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Flex>
  );
}
