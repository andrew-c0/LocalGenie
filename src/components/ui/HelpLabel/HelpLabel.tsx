import { Flex } from "../Flex/Flex";
import { InfoTooltip } from "../InfoTooltip/InfoTooltip";

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
      <InfoTooltip label={`About ${label}`} help={help} />
    </Flex>
  );
}
