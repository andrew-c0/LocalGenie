import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import type { ApprovalDecision } from "../../stores/toolApprovalStore";
import { useToolApprovalStore } from "../../stores/toolApprovalStore";
import { useToolStore } from "../../stores/toolStore";
import { approvalNote, prettyArguments, toolLabel, toolTargetSummary } from "../../utils/toolLines";
import { enabledSources } from "../../utils/webSearchSources";
import { Flex } from "../ui/Flex/Flex";
import { Body, BodyStrong } from "../ui/Typography/Typography";
import "./ToolApprovalDialog.css";

/**
 * Asks the user before a model's tool call runs. Mounted once for the app and shows the first request
 * of the queue. Closing it (Escape or the close control) denies the call, the same as Deny.
 */
export function ToolApprovalDialog() {
  const current = useToolApprovalStore((s) => (s.pending.length > 0 ? s.pending[0] : undefined));
  const resolveApproval = useToolApprovalStore((s) => s.resolveApproval);
  const tools = useToolStore((s) => s.tools);
  const searchSources = useToolStore((s) => s.searchSources);
  const enabledSearchSources = useToolStore((s) => s.enabledSearchSources);
  if (!current) return null;

  const { id, toolName, arguments: args } = current.request;
  const spec = tools.find((tool) => tool.name === toolName);
  const target = toolTargetSummary(args);
  const note = approvalNote(
    toolName,
    spec?.risk,
    args,
    enabledSources(enabledSearchSources, searchSources),
  );
  const decide = (decision: ApprovalDecision) => resolveApproval(id, decision);

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) decide("deny");
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Allow this tool call?</DialogTitle>
          <DialogContent>
            <Flex direction="column" gap="s">
              <BodyStrong>{toolLabel(toolName)}</BodyStrong>
              {target && <BodyStrong className="tool-approval__target">{target}</BodyStrong>}
              {note && <Body>{note}</Body>}
              <pre className="tool-approval__arguments">{prettyArguments(args)}</pre>
            </Flex>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" autoFocus onClick={() => decide("deny")}>
              Deny
            </Button>
            <Button appearance="primary" onClick={() => decide("once")}>
              Allow once
            </Button>
            <Button appearance="secondary" onClick={() => decide("chat")}>
              Allow for this chat
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
