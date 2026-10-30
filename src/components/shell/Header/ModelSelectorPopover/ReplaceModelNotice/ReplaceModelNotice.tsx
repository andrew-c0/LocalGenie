import { Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { LoadedServer } from "../../../../../utils/loadedServers";
import { replacementText } from "../../../../../utils/modelSelector";
import { Flex } from "../../../../ui/Flex/Flex";
import { Body } from "../../../../ui/Typography/Typography";

interface ReplaceModelNoticeProps {
  modelName: string;
  /** The model on the compute the load would use. Null when none is known. */
  occupant: LoadedServer | null;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Inline confirmation for a load that unloads the model on its compute first. */
export function ReplaceModelNotice({
  modelName,
  occupant,
  disabled,
  onCancel,
  onConfirm,
}: ReplaceModelNoticeProps) {
  return (
    <MessageBar intent="warning">
      <MessageBarBody>
        <Flex direction="column" gap="xs" align="stretch">
          <Body>{replacementText(modelName, occupant)}</Body>
          <Flex gap="s" justify="end">
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button appearance="primary" disabled={disabled} onClick={onConfirm}>
              Unload and load
            </Button>
          </Flex>
        </Flex>
      </MessageBarBody>
    </MessageBar>
  );
}
