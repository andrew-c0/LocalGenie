import { UPSCALE_FACTOR } from "../../../utils/upscale";
import { UPSCALE_FACTOR_NOTE, UPSCALE_SCALE_INFO_LABEL } from "../../../utils/upscaleText";
import { Flex } from "../../ui/Flex/Flex";
import { InfoTooltip } from "../../ui/InfoTooltip/InfoTooltip";
import { Body } from "../../ui/Typography/Typography";

/** The fixed scale in the card header: "Scale 4x" with an info icon that explains why it is fixed. */
export function UpscaleScale() {
  return (
    <Flex gap="xs" align="center">
      <Body>Scale {UPSCALE_FACTOR}x</Body>
      <InfoTooltip label={UPSCALE_SCALE_INFO_LABEL} help={UPSCALE_FACTOR_NOTE} />
    </Flex>
  );
}
