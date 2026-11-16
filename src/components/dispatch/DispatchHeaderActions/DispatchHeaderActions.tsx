import { Button, Toolbar, ToolbarButton } from "@fluentui/react-components";
import { ArrowClockwiseRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useNow } from "../../../hooks/useNow";
import type { DispatchTask } from "../../../types";
import { conversationActionsOf, statusBadgeOf } from "../../../utils/dispatchStatus";
import { cutChars, isWorking, TITLE_MAX_CHARS } from "../../../utils/dispatchTask";
import { elapsedMsOf, formatElapsed } from "../../../utils/dispatchTime";
import { ConversationMenu } from "../../chat/ConversationMenu/ConversationMenu";
import { DeleteConversationDialog } from "../../chat/DeleteConversationDialog/DeleteConversationDialog";
import { BreadcrumbActions } from "../../ui/Breadcrumbs/BreadcrumbActions";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import { Meta } from "../../ui/Typography/Typography";
import type { ConversationActionHandlers } from "../ConversationView/useConversationActions";

interface DispatchHeaderActionsProps {
  task: DispatchTask;
  actions: ConversationActionHandlers;
}

/**
 * The open conversation's controls, at the end of the breadcrumb row as the chat's are: its status and, while
 * its turn works, the time it has run; Continue when it stopped; the conversation menu with Delete when it is
 * not busy. The dialog sits outside the portal, since it portals itself.
 */
export function DispatchHeaderActions({ task, actions }: DispatchHeaderActionsProps) {
  const now = useNow(isWorking(task.status));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const offered = conversationActionsOf(task.status);
  const badge = statusBadgeOf(task.status);
  const elapsedMs = isWorking(task.status) ? elapsedMsOf(task, now) : null;
  const title = cutChars(task.goal, TITLE_MAX_CHARS);
  const actionBusy = actions.pendingAction !== null;

  return (
    <>
      <BreadcrumbActions>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {elapsedMs !== null && <Meta>{`Elapsed ${formatElapsed(elapsedMs)}`}</Meta>}
        {offered.includes("continue") && (
          <Button
            size="small"
            appearance="secondary"
            icon={<ArrowClockwiseRegular />}
            disabled={actionBusy}
            onClick={actions.continue}
          >
            Continue
          </Button>
        )}
        {offered.includes("delete") && (
          <Toolbar aria-label="Conversation actions">
            <ConversationMenu
              title={title}
              onDelete={() => setConfirmingDelete(true)}
              trigger={
                <ToolbarButton
                  icon={<MoreHorizontalRegular />}
                  title="More conversation actions"
                  aria-label="More conversation actions"
                  disabled={actionBusy}
                />
              }
            />
          </Toolbar>
        )}
      </BreadcrumbActions>
      {confirmingDelete && (
        <DeleteConversationDialog
          title={title}
          onConfirm={() => {
            setConfirmingDelete(false);
            actions.remove();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
