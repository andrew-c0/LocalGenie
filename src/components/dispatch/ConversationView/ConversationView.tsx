import { useSessionMessages } from "../../../hooks/useSessionMessages";
import { useTurnAvailability } from "../../../hooks/useTurnAvailability";
import { useChatStore } from "../../../stores/chatStore";
import type { DispatchTask } from "../../../types";
import { isBusy } from "../../../utils/dispatchTask";
import MessageList from "../../chat/MessageList/MessageList";
import { Secondary } from "../../ui/Typography/Typography";
import { ConversationNotes } from "../ConversationNotes/ConversationNotes";
import { DispatchHeaderActions } from "../DispatchHeaderActions/DispatchHeaderActions";
import { DispatchInput } from "../DispatchInput/DispatchInput";
import "./ConversationView.css";
import { useConversationActions } from "./useConversationActions";
import { useSessionToolSwitches } from "./useSessionToolSwitches";

interface ConversationViewProps {
  task: DispatchTask;
}

/**
 * One Dispatch conversation, laid out as the chat is: its header actions in the breadcrumbs, its notes above the
 * transcript, the transcript (read-only, the chat's own rendering) and the message field at the bottom. It is a
 * part of the page's canvas, so the parts stack in it.
 */
export function ConversationView({ task }: ConversationViewProps) {
  const messages = useSessionMessages(task.sessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const compacting = useChatStore((s) => s.compacting);
  const { blocker, queuedNote } = useTurnAvailability(task.id);
  const actions = useConversationActions(task.id);
  const switches = useSessionToolSwitches(task.sessionId);

  return (
    <>
      <DispatchHeaderActions task={task} actions={actions} />

      <div className="conversation-view__notes">
        {task.status === "interrupted" && (
          <Secondary>
            LocalGenie closed while this conversation was working. Continue picks it up from the
            messages so far.
          </Secondary>
        )}
        <ConversationNotes notes={task.notes} />
      </div>

      <MessageList
        viewKey={task.sessionId}
        messages={messages}
        isStreaming={isStreaming}
        compacting={compacting}
        readOnly
        inDispatch
        className="conversation-canvas__transcript"
      />

      <DispatchInput
        blocker={blocker}
        queuedNote={queuedNote}
        showStop={isBusy(task.status)}
        onSend={actions.send}
        onStop={actions.stop}
        switches={switches}
        placeholder="Message Dispatch… (Shift+Enter for new line)"
      />
    </>
  );
}
