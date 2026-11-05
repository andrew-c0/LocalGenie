import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
} from "@fluentui/react-components";
import type { ReactNode } from "react";
import type { ImageForm, ImageModel } from "../../../../types";
import { ADVANCED_SETTINGS_LABEL } from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { NegativePromptField } from "../ImageSettingsFields/NegativePromptField";
import { SeedFields } from "../ImageSettingsFields/SeedFields";
import { StepsCfgFields } from "../ImageSettingsFields/StepsCfgFields";

interface AdvancedSettingsProps {
  form: ImageForm;
  /** The selected model. Its capabilities decide which fields can be changed. */
  model: ImageModel | null;
  onChange: (patch: Partial<ImageForm>) => void;
  /** One more field for the settings row, e.g. a tab's own strength. */
  extra?: ReactNode;
}

/**
 * The settings both image tabs keep out of the way: an accordion that starts closed, with the negative prompt above
 * one row of steps, CFG scale and seed. It stays editable while a job runs.
 */
export function AdvancedSettings({ form, model, onChange, extra }: AdvancedSettingsProps) {
  return (
    <Accordion collapsible>
      <AccordionItem value="advanced">
        <AccordionHeader>{ADVANCED_SETTINGS_LABEL}</AccordionHeader>
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
              {extra}
            </Flex>
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
