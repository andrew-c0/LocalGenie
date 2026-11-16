import { useChatStore } from "../../../stores/chatStore";
import type { DispatchTask } from "../../../types";
import { statusBadgeOf } from "../../../utils/dispatchStatus";
import { cutChars, TITLE_MAX_CHARS } from "../../../utils/dispatchTask";
import { ageLabel } from "../../../utils/dispatchTime";
import { ItemRow } from "../../ui/ItemRow/ItemRow";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";

interface TaskRowProps {
  task: DispatchTask;
  /** The current time, for the relative time of the last message. */
  now: number;
  onOpen: () => void;
}

/** One Dispatch conversation in the recent list: its first message, its status and when it last had a message. */
export function TaskRow({ task, now, onOpen }: TaskRowProps) {
  // The session's update time moves with every message, so it is the conversation's last activity.
  const lastActivityAt = useChatStore(
    (s) => s.sessions.find((session) => session.id === task.sessionId)?.updatedAt ?? task.createdAt,
  );
  const badge = statusBadgeOf(task.status);

  return (
    <ItemRow
      title={cutChars(task.goal, TITLE_MAX_CHARS)}
      detail={ageLabel(lastActivityAt, now)}
      badge={<StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
      onOpen={onOpen}
    />
  );
}
