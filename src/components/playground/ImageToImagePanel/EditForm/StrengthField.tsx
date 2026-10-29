import { Field, Slider } from "@fluentui/react-components";
import { STRENGTH_MAX, STRENGTH_MIN, STRENGTH_STEP } from "../../../../utils/imageToImage";
import { STRENGTH_HELP, STRENGTH_LABEL } from "../../../../utils/imageToImageText";
import { Flex } from "../../../ui/Flex/Flex";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import { Body } from "../../../ui/Typography/Typography";

interface StrengthFieldProps {
  value: number;
  onChange: (value: number) => void;
}

/** How far a re-draw model moves away from the input picture, as a slider with its value beside it. */
export function StrengthField({ value, onChange }: StrengthFieldProps) {
  return (
    <Field label={<HelpLabel label={STRENGTH_LABEL} help={STRENGTH_HELP} />}>
      <Flex gap="m" align="center">
        <div className="flex-grow">
          <Slider
            min={STRENGTH_MIN}
            max={STRENGTH_MAX}
            step={STRENGTH_STEP}
            value={value}
            onChange={(_, data) => onChange(data.value)}
          />
        </div>
        <Body>{value.toFixed(2)}</Body>
      </Flex>
    </Field>
  );
}
