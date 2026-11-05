import { ToggleButton } from "@fluentui/react-components";
import { SplitHorizontalRegular } from "@fluentui/react-icons";
import { UPSCALE_COMPARE_LABEL } from "../../../utils/upscaleText";

interface UpscaleCompareToggleProps {
  checked: boolean;
  /** Off until both the input and the upscaled picture have loaded. */
  disabled: boolean;
  onToggle: () => void;
}

/** The Compare switch in the card header. It shows the input and the upscaled picture split by a divider. */
export function UpscaleCompareToggle({ checked, disabled, onToggle }: UpscaleCompareToggleProps) {
  return (
    <ToggleButton
      appearance="secondary"
      icon={<SplitHorizontalRegular />}
      checked={checked}
      disabled={disabled}
      onClick={onToggle}
    >
      {UPSCALE_COMPARE_LABEL}
    </ToggleButton>
  );
}
