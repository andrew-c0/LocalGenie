import { Button } from "@fluentui/react-components";
import { Flex } from "../../../ui/Flex/Flex";
import { Meta } from "../../../ui/Typography/Typography";

interface GenerateFooterProps {
  onGenerate: () => void;
  /** Why Generate is off. Null when it can run. */
  blockedReason: string | null;
  /** The note under the button, e.g. how long a run takes. */
  note: string;
}

/** The Generate button, the reason it is off, and a note under it. Both image tabs use it. */
export function GenerateFooter({ onGenerate, blockedReason, note }: GenerateFooterProps) {
  return (
    <Flex direction="column" gap="xs">
      <Flex gap="m" align="center" wrap>
        <Button appearance="primary" onClick={onGenerate} disabled={blockedReason !== null}>
          Generate
        </Button>
        {blockedReason && <Meta>{blockedReason}</Meta>}
      </Flex>
      <Meta>{note}</Meta>
    </Flex>
  );
}
