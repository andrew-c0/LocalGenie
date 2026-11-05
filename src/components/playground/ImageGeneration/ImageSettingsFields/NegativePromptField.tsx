import type { ImageModel } from "../../../../types";
import { imageFormControls } from "../../../../utils/playground";
import { NEGATIVE_PROMPT_HELP, NEGATIVE_PROMPT_HINT } from "../../../../utils/playgroundText";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import { PromptField } from "../PromptField/PromptField";

interface NegativePromptFieldProps {
  value: string;
  /** The selected model. A model that takes no negative prompt locks the box. */
  model: ImageModel | null;
  onChange: (negativePrompt: string) => void;
  /** Height of the box in lines. Defaults to 2. */
  rows?: number;
}

/**
 * The negative prompt box. A model that takes none locks it: the reason joins the info text and shows as a tooltip
 * on the box, and no line sits under the box. When the box is open, its usual hint shows under it.
 */
export function NegativePromptField({
  value,
  model,
  onChange,
  rows = 2,
}: NegativePromptFieldProps) {
  const lockedReason = imageFormControls(model).negativePromptReason;

  return (
    <PromptField
      label={
        <HelpLabel
          label="Negative prompt"
          help={lockedReason ? `${NEGATIVE_PROMPT_HELP} ${lockedReason}` : NEGATIVE_PROMPT_HELP}
        />
      }
      hint={lockedReason ? undefined : NEGATIVE_PROMPT_HINT}
      disabled={lockedReason !== null}
      lockedReason={lockedReason}
      value={value}
      onChange={onChange}
      rows={rows}
    />
  );
}
