import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ConversationView } from "../../components/dispatch/ConversationView/ConversationView";
import { DispatchLanding } from "../../components/dispatch/DispatchLanding/DispatchLanding";
import { DispatchLoadStatus } from "../../components/dispatch/DispatchLoadStatus/DispatchLoadStatus";
import { ConversationCanvas } from "../../components/ui/ConversationCanvas/ConversationCanvas";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { useBreadcrumbLabel } from "../../navigation/useBreadcrumbLabel";
import { useDispatchStore } from "../../stores/dispatchStore";
import { cutChars, TITLE_MAX_CHARS } from "../../utils/dispatchTask";

/**
 * Dispatch, laid out as the chat is. `/dispatch` shows the landing: the recent conversations and the message field
 * that starts one. `/dispatch/:taskId` opens that conversation, full width. The URL is the selection.
 */
export default function DispatchPage() {
  const { taskId } = useParams<{ taskId?: string }>();
  const tasks = useDispatchStore((s) => s.tasks);
  const loaded = useDispatchStore((s) => s.loaded);
  const selected = tasks.find((task) => task.id === taskId) ?? null;

  // The breadcrumb names the conversation by its first message, so the opaque id never shows.
  useBreadcrumbLabel(selected ? cutChars(selected.goal, TITLE_MAX_CHARS) : null);

  let content: ReactNode;
  if (taskId === undefined) {
    content = <DispatchLanding />;
  } else if (selected) {
    // Keyed by the conversation, so its draft and pending action do not carry over to another one.
    content = <ConversationView key={selected.id} task={selected} />;
  } else if (!loaded) {
    content = (
      <div className="conversation-canvas__empty">
        <DispatchLoadStatus />
      </div>
    );
  } else {
    // The breadcrumb's "Dispatch" crumb leads back to the landing, so no button is needed here.
    content = (
      <div className="conversation-canvas__empty">
        <StateBlock icon="🔎" message="This conversation no longer exists." />
      </div>
    );
  }

  return <ConversationCanvas>{content}</ConversationCanvas>;
}
