import { Tooltip } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { Flex } from "../Flex/Flex";
import "./HelpLabel.css";

interface HelpLabelProps {
  /** Visible label text. Also names the help button for screen readers. */
  label: string;
  /** Plain-language explanation shown on hover and focus. */
  help: string;
}

/** A field label with an info icon. The icon's tooltip is reachable by keyboard and is announced as the description. */
export function HelpLabel({ label, help }: HelpLabelProps) {
  return (
    <Flex as="span" align="center" gap="xs">
      <span>{label}</span>
      <Tooltip content={help} relationship="description" withArrow>
        <button type="button" className="help-label__button" aria-label={`About ${label}`}>
          <InfoRegular aria-hidden />
        </button>
      </Tooltip>
    </Flex>
  );
}
