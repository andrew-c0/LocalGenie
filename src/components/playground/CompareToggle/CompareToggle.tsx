import { ToggleButton } from "@fluentui/react-components";
import { SplitHorizontalRegular } from "@fluentui/react-icons";
import { COMPARE_LABEL } from "../../../utils/playgroundText";

interface CompareToggleProps {
  checked: boolean;
  /** Off until both the input and the result picture have loaded. */
  disabled: boolean;
  onToggle: () => void;
}

/** The Compare switch in a card header. It shows the input and the result split by a divider. */
export function CompareToggle({ checked, disabled, onToggle }: CompareToggleProps) {
  return (
    <ToggleButton
      appearance="secondary"
      icon={<SplitHorizontalRegular />}
      checked={checked}
      disabled={disabled}
      onClick={onToggle}
    >
      {COMPARE_LABEL}
    </ToggleButton>
  );
}
